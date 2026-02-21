/**
 * CloudBase 部署脚本
 * 策略: 部署函数 + 修复静态托管访问 + 前端SDK调用函数
 */
const CloudBase = require('@cloudbase/manager-node');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ENV_ID = 'georgezhu-0gnrnw9ae9fca59a';
const FUNCTION_NAME = 'echoworld';
const SECRET_ID = process.env.TCB_SECRET_ID;
const SECRET_KEY = process.env.TCB_SECRET_KEY;

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

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

  // 0. 获取环境信息
  console.log('\n[0] 环境信息');
  try {
    const envInfo = await manager.commonService().call({
      Action: 'DescribeEnvs',
      Param: { EnvId: ENV_ID },
    });
    const env = envInfo.EnvList?.[0];
    if (env) {
      console.log(`  ${env.EnvId} | ${env.PackageName} | ${env.Status}`);
    }
  } catch (err) {
    console.log('  ', err.message);
  }

  // 1. 打包函数代码
  console.log('\n[1/4] 打包函数代码...');
  const projectDir = path.resolve(__dirname, '..');
  const fnRoot = '/tmp/echoworld-functions';
  const fnDir = path.join(fnRoot, FUNCTION_NAME);

  execSync(`rm -rf ${fnRoot} && mkdir -p ${fnDir}`);
  execSync(`cp -r ${projectDir}/dist ${fnDir}/`);
  if (fs.existsSync(path.join(projectDir, 'public'))) {
    execSync(`cp -r ${projectDir}/public ${fnDir}/`);
  }
  execSync(`cp ${projectDir}/scripts/fn-entry.js ${fnDir}/index.js`);

  const pkg = require(path.join(projectDir, 'package.json'));
  const minPkg = {
    name: pkg.name,
    version: pkg.version,
    main: 'index.js',
    dependencies: {
      express: pkg.dependencies.express,
      uuid: pkg.dependencies.uuid,
      ws: pkg.dependencies.ws,
      eventemitter3: pkg.dependencies.eventemitter3,
    },
  };
  fs.writeFileSync(path.join(fnDir, 'package.json'), JSON.stringify(minPkg, null, 2));
  execSync('npm install --omit=dev --no-package-lock', { cwd: fnDir, stdio: 'inherit' });
  execSync(`find ${fnDir}/node_modules -name "*.md" -o -name "*.txt" -o -name "*.map" -o -name "CHANGELOG*" -o -name "LICENSE*" -o -name "*.ts" -o -name ".npmignore" -o -name ".eslintrc*" -o -name ".editorconfig" | xargs rm -f 2>/dev/null || true`);
  execSync(`find ${fnDir}/node_modules -name "test" -o -name "tests" -o -name "example" -o -name "examples" -o -name ".github" | xargs rm -rf 2>/dev/null || true`);
  console.log(`  函数包大小: ${execSync(`du -sh ${fnDir}`).toString().split('\t')[0]}`);

  // 2. 部署云函数
  console.log('\n[2/4] 部署云函数...');
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
    functionRootPath: fnRoot,
  };

  try {
    await manager.functions.createFunction(funcConfig);
    console.log('  云函数部署成功!');
  } catch (err) {
    if (err.message?.includes('already exists')) {
      await manager.functions.deleteFunction({ functionName: FUNCTION_NAME });
      await new Promise(r => setTimeout(r, 2000));
      await manager.functions.createFunction(funcConfig);
      console.log('  云函数重新部署成功!');
    } else {
      throw err;
    }
  }

  // 3. 配置静态托管
  console.log('\n[3/4] 配置静态托管...');
  const publicDir = path.join(projectDir, 'public');

  // 上传文件
  try {
    await manager.hosting.uploadFiles({ localPath: publicDir, cloudPath: '/' });
    console.log('  静态文件已上传');
  } catch (err) {
    console.log('  上传:', err.message);
  }

  // 列出 hosting 模块所有方法
  if (manager.hosting) {
    const proto = Object.getPrototypeOf(manager.hosting);
    const methods = Object.getOwnPropertyNames(proto).filter(n => n !== 'constructor');
    console.log('  hosting 方法:', methods.join(', '));
  }

  // 尝试设置网站配置 (IndexDocument)
  try {
    if (typeof manager.hosting.config === 'function') {
      await manager.hosting.config({ indexPage: 'index.html', errorPage: '404.html' });
      console.log('  网站配置已设置');
    }
  } catch (err) {
    console.log('  hosting.config:', err.message);
  }

  // 尝试 tcb API 关闭登录鉴权
  const tcbApis = [
    { Action: 'DescribeCloudBaseGWService', Param: { ServiceId: ENV_ID } },
    { Action: 'DescribeHostingDomainTask', Param: { EnvId: ENV_ID } },
    { Action: 'DescribeCloudBaseBuildService', Param: { EnvId: ENV_ID } },
  ];
  for (const api of tcbApis) {
    try {
      const r = await manager.commonService().call(api);
      console.log(`  ${api.Action}:`, JSON.stringify(r, null, 2));
    } catch (err) {
      console.log(`  ${api.Action}: ${err.message}`);
    }
  }

  // 尝试通过 hosting 模块获取 COS 实例并配置网站
  try {
    // 方法1: hosting 可能有 getCos 方法
    if (typeof manager.hosting.getCos === 'function') {
      const cos = await manager.hosting.getCos();
      console.log('  获取到 hosting COS 实例');

      // 获取 bucket 信息
      const hostingBucket = '39aa-static-georgezhu-0gnrnw9ae9fca59a-1398720149';
      const region = 'ap-shanghai';

      // 设置 website 配置
      try {
        await new Promise((resolve, reject) => {
          cos.putBucketWebsite({
            Bucket: hostingBucket,
            Region: region,
            WebsiteConfiguration: {
              IndexDocument: { Suffix: 'index.html' },
              ErrorDocument: { Key: '404.html' },
            },
          }, (err, data) => err ? reject(err) : resolve(data));
        });
        console.log('  网站配置已设置 (COS)');
      } catch (e) {
        console.log('  putBucketWebsite:', e.message || JSON.stringify(e));
      }

      // 设置 bucket ACL 为 public-read
      try {
        await new Promise((resolve, reject) => {
          cos.putBucketAcl({
            Bucket: hostingBucket,
            Region: region,
            ACL: 'public-read',
          }, (err, data) => err ? reject(err) : resolve(data));
        });
        console.log('  Bucket ACL 设置为 public-read');
      } catch (e) {
        console.log('  putBucketAcl:', e.message || JSON.stringify(e));
      }
    }
  } catch (err) {
    console.log('  COS 配置:', err.message);
  }

  // 方法2: 通过 storage 模块尝试获取 COS 并操作 hosting bucket
  try {
    if (typeof manager.storage.getCos === 'function') {
      const cos = await manager.storage.getCos();
      console.log('  获取到 storage COS 实例');

      const hostingBucket = '39aa-static-georgezhu-0gnrnw9ae9fca59a-1398720149';
      const region = 'ap-shanghai';

      try {
        await new Promise((resolve, reject) => {
          cos.putBucketWebsite({
            Bucket: hostingBucket,
            Region: region,
            WebsiteConfiguration: {
              IndexDocument: { Suffix: 'index.html' },
              ErrorDocument: { Key: '404.html' },
            },
          }, (err, data) => err ? reject(err) : resolve(data));
        });
        console.log('  网站配置已设置 (storage COS)');
      } catch (e) {
        console.log('  putBucketWebsite (storage):', e.message || JSON.stringify(e));
      }

      try {
        await new Promise((resolve, reject) => {
          cos.putBucketAcl({
            Bucket: hostingBucket,
            Region: region,
            ACL: 'public-read',
          }, (err, data) => err ? reject(err) : resolve(data));
        });
        console.log('  Bucket ACL 设置为 public-read (storage)');
      } catch (e) {
        console.log('  putBucketAcl (storage):', e.message || JSON.stringify(e));
      }

      // 也获取当前的网站配置
      try {
        const websiteConfig = await new Promise((resolve, reject) => {
          cos.getBucketWebsite({
            Bucket: hostingBucket,
            Region: region,
          }, (err, data) => err ? reject(err) : resolve(data));
        });
        console.log('  当前网站配置:', JSON.stringify(websiteConfig, null, 2));
      } catch (e) {
        console.log('  getBucketWebsite:', e.message || JSON.stringify(e));
      }
    }
  } catch (err) {
    console.log('  storage COS:', err.message);
  }

  // 4. 确保匿名登录
  console.log('\n[4/4] 配置匿名登录...');
  try {
    await manager.commonService().call({
      Action: 'CreateLoginConfig',
      Param: { EnvId: ENV_ID, Platform: 'ANONYMOUS' },
    });
    console.log('  匿名登录已配置');
  } catch (err) {
    console.log('  CreateLoginConfig:', err.message);
  }

  // 测试函数调用
  console.log('\n========== 测试 ==========');

  // 测试云函数
  try {
    const fnResult = await manager.functions.invokeFunction(FUNCTION_NAME, { test: true });
    console.log('  函数调用:', JSON.stringify(fnResult).substring(0, 200));
  } catch (err) {
    console.log('  函数调用:', err.message);
  }

  // 测试静态托管
  const staticDomain = 'georgezhu-0gnrnw9ae9fca59a-1398720149.tcloudbaseapp.com';
  const staticUrl = `https://${staticDomain}`;
  console.log(`\n  测试 ${staticUrl}`);
  try {
    const resp = await httpGet(staticUrl);
    console.log(`  HTTP ${resp.statusCode} | body: ${resp.body.length} bytes`);
    console.log(`  headers:`, JSON.stringify(resp.headers, null, 2));
    if (resp.body.length > 0 && resp.body.length < 500) {
      console.log(`  body: ${resp.body}`);
    }
  } catch (err) {
    console.log(`  测试失败: ${err.message}`);
  }

  console.log(`\n  测试 ${staticUrl}/index.html`);
  try {
    const resp = await httpGet(`${staticUrl}/index.html`);
    console.log(`  HTTP ${resp.statusCode} | body: ${resp.body.length} bytes`);
  } catch (err) {
    console.log(`  测试失败: ${err.message}`);
  }

  // 结果
  console.log('\n========================================');
  console.log('  部署完成!');
  console.log(`  环境: ${ENV_ID}`);
  console.log(`  静态托管: ${staticUrl}`);
  console.log(`  控制台: https://console.cloud.tencent.com/tcb/env/overview?envId=${ENV_ID}`);
  console.log('========================================');
  console.log('\n=== 部署完成 ===');
}

deploy().catch(err => {
  console.error('\n部署失败:', err);
  process.exit(1);
});
