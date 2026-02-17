/**
 * CloudBase 部署脚本
 * 使用 @cloudbase/manager-node SDK 直接部署，绕过 CLI 的 webpack 限制
 */
const CloudBase = require('@cloudbase/manager-node');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ENV_ID = 'georgezhu-0gnrnw9ae9fca59a';
const FUNCTION_NAME = 'echoworld';
const SECRET_ID = process.env.TCB_SECRET_ID;
const SECRET_KEY = process.env.TCB_SECRET_KEY;

async function deploy() {
  console.log('=== CloudBase Deploy Script ===');

  if (!SECRET_ID || !SECRET_KEY) {
    throw new Error('TCB_SECRET_ID and TCB_SECRET_KEY must be set');
  }

  const manager = new CloudBase({
    secretId: SECRET_ID,
    secretKey: SECRET_KEY,
    envId: ENV_ID,
  });

  // 1. 打包函数代码为精简 zip（<1.5MB）
  console.log('\n[1/5] 打包函数代码...');
  const projectDir = path.resolve(__dirname, '..');
  const fnDir = '/tmp/echoworld-fn';
  const zipPath = '/tmp/echoworld-fn.zip';

  execSync(`rm -rf ${fnDir} && mkdir -p ${fnDir}`);

  // 复制编译后的 dist、public 和云函数入口
  execSync(`cp -r ${projectDir}/dist ${fnDir}/`);
  if (fs.existsSync(path.join(projectDir, 'public'))) {
    execSync(`cp -r ${projectDir}/public ${fnDir}/`);
  }
  // 复制云函数入口文件
  execSync(`cp ${projectDir}/scripts/fn-entry.js ${fnDir}/index.js`);

  // 创建精简的 package.json（只保留生产依赖）
  const pkg = require(path.join(projectDir, 'package.json'));
  const minPkg = {
    name: pkg.name,
    version: pkg.version,
    main: 'dist/index.js',
    dependencies: {
      express: pkg.dependencies.express,
      uuid: pkg.dependencies.uuid,
      ws: pkg.dependencies.ws,
      eventemitter3: pkg.dependencies.eventemitter3,
    },
  };
  fs.writeFileSync(path.join(fnDir, 'package.json'), JSON.stringify(minPkg, null, 2));

  // 安装精简依赖
  execSync('npm install --omit=dev --no-package-lock', { cwd: fnDir, stdio: 'inherit' });

  // 清理不需要的文件以减小体积
  execSync(`find ${fnDir}/node_modules -name "*.md" -o -name "*.txt" -o -name "*.map" -o -name "CHANGELOG*" -o -name "LICENSE*" -o -name "*.ts" -o -name ".npmignore" -o -name ".eslintrc*" -o -name ".editorconfig" | xargs rm -f 2>/dev/null || true`);
  execSync(`find ${fnDir}/node_modules -name "test" -o -name "tests" -o -name "example" -o -name "examples" -o -name ".github" | xargs rm -rf 2>/dev/null || true`);

  // 计算大小
  const totalSize = execSync(`du -sh ${fnDir}`).toString().split('\t')[0];
  console.log(`  函数包大小: ${totalSize}`);

  // 2. 部署云函数
  console.log('\n[2/5] 部署云函数...');

  const funcConfig = {
    func: {
      name: FUNCTION_NAME,
      timeout: 30,
      runtime: 'Nodejs16.13',
      handler: 'index.main',
      envVariables: {
        ZHIPU_API_KEY: process.env.ZHIPU_API_KEY || '',
        ZHIPU_MODEL: 'glm-4-flash',
        DEPLOY_ENV: 'cloudbase',
      },
    },
    force: true,
    functionRootPath: fnDir,
  };

  // 始终使用 functionRootPath（SDK 自动通过 COS 上传）
  console.log('  使用 COS 上传方式...');

  try {
    await manager.functions.createFunction(funcConfig);
    console.log('  云函数部署成功!');
  } catch (err) {
    if (err.message && err.message.includes('already exists')) {
      console.log('  函数已存在，尝试更新...');
      try {
        // 先删除再创建
        await manager.functions.deleteFunction({ functionName: FUNCTION_NAME });
        console.log('  旧函数已删除');
        await manager.functions.createFunction(funcConfig);
        console.log('  云函数重新创建成功!');
      } catch (err2) {
        console.error('  重新创建失败:', err2.message);
        throw err2;
      }
    } else {
      console.error('  部署失败:', err.message);
      throw err;
    }
  }

  // 3. 尝试开通 HTTP 访问服务
  console.log('\n[3/5] 检查/开通 HTTP 访问服务...');
  try {
    await manager.commonService().call({
      Action: 'EstablishCloudBaseRunServer',
      Param: { EnvId: ENV_ID },
    });
    console.log('  HTTP 服务开通成功');
  } catch (err) {
    console.log('  HTTP 服务:', err.message);
  }

  // 4. 创建 HTTP 触发路由
  console.log('\n[4/5] 创建 HTTP 访问路由...');
  try {
    await manager.commonService().call({
      Action: 'CreateCloudBaseGWAPI',
      Param: {
        ServiceId: ENV_ID,
        EnvId: ENV_ID,
        Path: '/echoworld',
        Type: 1,
        Name: FUNCTION_NAME,
      },
    });
    console.log('  路由 /echoworld 创建成功');
  } catch (err) {
    if (err.message && err.message.includes('bindPath already bindName')) {
      console.log('  路由 /echoworld 已存在');
    } else {
      console.log('  创建路由:', err.message);
    }
  }

  // 5. 获取部署结果
  console.log('\n[5/5] 获取部署结果...');
  const fnList = await manager.functions.listFunctions().catch(() => null);
  console.log('\n=== 部署结果 ===');
  if (fnList && fnList.Functions) {
    console.log('云函数列表:');
    for (const fn of fnList.Functions) {
      console.log(`  - ${fn.FunctionName} (${fn.Runtime}) Status: ${fn.Status}`);
    }
  }

  // 查询 HTTP 访问服务列表
  try {
    const gwList = await manager.commonService().call({
      Action: 'DescribeCloudBaseGWAPI',
      Param: { ServiceId: ENV_ID, EnvId: ENV_ID },
    });
    console.log('\nHTTP 路由:');
    if (gwList && gwList.APISet) {
      for (const api of gwList.APISet) {
        console.log(`  ${api.Path} -> ${api.Name} (${api.Type === 1 ? '云函数' : '其他'})`);
      }
    }
  } catch (err) {
    console.log('  获取路由列表:', err.message);
  }

  // 查询默认域名
  try {
    const domainResult = await manager.commonService().call({
      Action: 'DescribeCloudBaseGWService',
      Param: { ServiceId: ENV_ID, EnvId: ENV_ID },
    });
    if (domainResult && domainResult.DefaultDomain) {
      console.log(`\n访问地址: https://${domainResult.DefaultDomain}/echoworld`);
    } else {
      console.log('\n访问地址: https://' + ENV_ID + '.service.tcloudbase.com/echoworld');
    }
    console.log('域名信息:', JSON.stringify(domainResult).substring(0, 300));
  } catch (err) {
    console.log('  获取域名:', err.message);
    console.log('\n访问地址: https://' + ENV_ID + '.service.tcloudbase.com/echoworld');
  }

  console.log('\n控制台: https://console.cloud.tencent.com/tcb/env/access?envId=' + ENV_ID);
  console.log('\n=== 部署完成 ===');
}

deploy().catch(err => {
  console.error('\n部署失败:', err);
  process.exit(1);
});
