/**
 * CloudBase 部署脚本
 * 使用 @cloudbase/manager-node SDK 部署云函数
 * 使用 Tencent Cloud API v3 创建 SCF API Gateway 触发器提供 HTTP 访问
 */
const CloudBase = require('@cloudbase/manager-node');
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ENV_ID = 'georgezhu-0gnrnw9ae9fca59a';
const FUNCTION_NAME = 'echoworld';
const SECRET_ID = process.env.TCB_SECRET_ID;
const SECRET_KEY = process.env.TCB_SECRET_KEY;
const REGION = 'ap-shanghai';

// ============ Tencent Cloud API v3 签名工具 ============

function tcApiCall(service, action, version, payload, region) {
  return new Promise((resolve, reject) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().split('T')[0];
    const host = `${service}.tencentcloudapi.com`;
    const payloadStr = JSON.stringify(payload);

    // Step 1: Canonical Request
    const hashedPayload = crypto.createHash('sha256').update(payloadStr).digest('hex');
    const canonicalRequest = [
      'POST', '/', '',
      `content-type:application/json\nhost:${host}\n`,
      'content-type;host',
      hashedPayload
    ].join('\n');

    // Step 2: String to Sign
    const credentialScope = `${date}/${service}/tc3_request`;
    const hashedCanonical = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = [
      'TC3-HMAC-SHA256', String(timestamp), credentialScope, hashedCanonical
    ].join('\n');

    // Step 3: Calculate Signature
    const secretDate = crypto.createHmac('sha256', `TC3${SECRET_KEY}`).update(date).digest();
    const secretService = crypto.createHmac('sha256', secretDate).update(service).digest();
    const secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest();
    const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');

    // Step 4: Authorization Header
    const authorization = `TC3-HMAC-SHA256 Credential=${SECRET_ID}/${credentialScope}, SignedHeaders=content-type;host, Signature=${signature}`;

    const options = {
      hostname: host,
      method: 'POST',
      path: '/',
      headers: {
        'Content-Type': 'application/json',
        'Host': host,
        'X-TC-Action': action,
        'X-TC-Timestamp': String(timestamp),
        'X-TC-Version': version,
        'X-TC-Region': region || REGION,
        'Authorization': authorization
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.Response && result.Response.Error) {
            reject(new Error(`[${action}] ${result.Response.Error.Code}: ${result.Response.Error.Message}`));
          } else {
            resolve(result.Response);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payloadStr);
    req.end();
  });
}

// ============ 主部署流程 ============

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

  // 0. 获取环境信息和地域
  console.log('\n[0] 获取环境信息...');
  try {
    const envInfo = await manager.commonService().call({
      Action: 'DescribeEnvs',
      Param: { EnvId: ENV_ID },
    });
    if (envInfo && envInfo.EnvList && envInfo.EnvList[0]) {
      const env = envInfo.EnvList[0];
      console.log(`  环境: ${env.EnvId} (${env.Source || 'unknown'}) 状态: ${env.Status}`);
      console.log(`  套餐: ${env.PackageName || 'unknown'}`);
    }
  } catch (err) {
    console.log('  获取环境信息:', err.message);
  }

  // 1. 打包函数代码
  console.log('\n[1/6] 打包函数代码...');
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

  const totalSize = execSync(`du -sh ${fnDir}`).toString().split('\t')[0];
  console.log(`  函数包大小: ${totalSize}`);

  // 2. 部署云函数到 CloudBase
  console.log('\n[2/6] 部署云函数...');

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

  console.log('  使用 COS 上传方式...');
  try {
    await manager.functions.createFunction(funcConfig);
    console.log('  云函数部署成功!');
  } catch (err) {
    if (err.message && err.message.includes('already exists')) {
      console.log('  函数已存在，尝试更新...');
      try {
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

  // 3. 尝试开通 CloudBase HTTP 访问服务
  console.log('\n[3/6] 尝试开通 CloudBase HTTP 访问服务...');
  try {
    await manager.access.switchAuth(true);
    console.log('  HTTP 访问服务已开通');
  } catch (err) {
    console.log('  CloudBase HTTP 服务:', err.message);
    console.log('  (免费套餐限制，将使用 SCF API Gateway 触发器作为替代)');
  }

  // 4. 创建 CloudBase HTTP 路由
  console.log('\n[4/6] 创建 CloudBase HTTP 路由...');
  try {
    const result = await manager.access.createAccess({
      path: '/echoworld',
      name: FUNCTION_NAME,
      type: 1,
      auth: false,
    });
    console.log('  路由 /echoworld 创建成功, APIId:', result.APIId);
  } catch (err) {
    if (err.message && (err.message.includes('bindPath already') || err.message.includes('bindpath already'))) {
      console.log('  路由 /echoworld 已存在');
    } else {
      console.log('  创建路由:', err.message);
    }
  }

  // 5. 创建 SCF API Gateway 触发器（独立于 CloudBase HTTP 服务）
  console.log('\n[5/6] 创建 SCF API Gateway 触发器...');
  let apiGatewayUrl = null;

  // 5a. 先确保 SCF 服务角色存在（首次使用 SCF 需要创建服务角色）
  try {
    console.log('  检查/创建 SCF 服务角色...');
    await tcApiCall('cam', 'CreateServiceLinkedRole', '2019-01-16', {
      QCSServiceName: ['scf.qcloud.com'],
    });
    console.log('  SCF 服务角色创建成功');
  } catch (err) {
    if (err.message && err.message.includes('already exists')) {
      console.log('  SCF 服务角色已存在');
    } else {
      console.log('  创建 SCF 服务角色:', err.message);
      // 继续尝试，可能角色已存在但返回了不同错误
    }
  }

  // 5b. 同时确保 API Gateway 服务角色存在
  try {
    await tcApiCall('cam', 'CreateServiceLinkedRole', '2019-01-16', {
      QCSServiceName: ['apigateway.qcloud.com'],
    });
    console.log('  API Gateway 服务角色创建成功');
  } catch (err) {
    if (err.message && err.message.includes('already exists')) {
      console.log('  API Gateway 服务角色已存在');
    } else {
      console.log('  创建 API Gateway 服务角色:', err.message);
    }
  }

  try {
    // 先检查是否已有 API Gateway 触发器
    const triggers = await tcApiCall('scf', 'ListTriggers', '2018-04-16', {
      FunctionName: FUNCTION_NAME,
      Namespace: ENV_ID,
    });

    let existingApigwTrigger = null;
    if (triggers && triggers.Triggers) {
      for (const t of triggers.Triggers) {
        console.log(`  已有触发器: ${t.TriggerName} (${t.Type})`);
        if (t.Type === 'apigw') {
          existingApigwTrigger = t;
        }
      }
    }

    if (existingApigwTrigger) {
      console.log('  API Gateway 触发器已存在');
      // 解析触发器描述获取 URL
      try {
        const desc = JSON.parse(existingApigwTrigger.TriggerDesc);
        if (desc.service && desc.service.subDomain) {
          apiGatewayUrl = `https://${desc.service.subDomain}/release/`;
          console.log(`  API Gateway URL: ${apiGatewayUrl}`);
        }
      } catch (e) {
        console.log('  无法解析触发器描述:', existingApigwTrigger.TriggerDesc?.substring(0, 200));
      }
    } else {
      // 创建新的 API Gateway 触发器
      console.log('  创建新的 API Gateway 触发器...');
      const triggerDesc = JSON.stringify({
        api: {
          authRequired: 'FALSE',
          requestConfig: {
            method: 'ANY'
          },
          isIntegratedResponse: 'TRUE'
        },
        service: {
          serviceName: 'SCF_API_SERVICE_echoworld'
        },
        release: {
          environmentName: 'release'
        }
      });

      const triggerResult = await tcApiCall('scf', 'CreateTrigger', '2018-04-16', {
        FunctionName: FUNCTION_NAME,
        TriggerName: 'apigw_echoworld',
        Type: 'apigw',
        TriggerDesc: triggerDesc,
        Namespace: ENV_ID,
        Qualifier: '$DEFAULT',
      });

      console.log('  API Gateway 触发器创建成功!');
      console.log('  触发器信息:', JSON.stringify(triggerResult).substring(0, 500));

      // 从响应中提取 URL
      if (triggerResult && triggerResult.TriggerInfo) {
        try {
          const info = JSON.parse(triggerResult.TriggerInfo.TriggerDesc || '{}');
          if (info.service && info.service.subDomain) {
            apiGatewayUrl = `https://${info.service.subDomain}/release/`;
          }
        } catch (e) {}
      }
    }
  } catch (err) {
    console.log('  SCF API Gateway 触发器:', err.message);
    console.log('  (如果 API Gateway 已下线，此方式不可用)');
  }

  // 6. 获取部署结果
  console.log('\n[6/6] 获取部署结果...');
  const fnList = await manager.functions.listFunctions().catch(() => null);
  console.log('\n=== 部署结果 ===');
  if (fnList && fnList.Functions) {
    console.log('云函数列表:');
    for (const fn of fnList.Functions) {
      console.log(`  - ${fn.FunctionName} (${fn.Runtime}) Status: ${fn.Status}`);
    }
  }

  // 查询 SCF 函数详情（获取可能的 Function URL）
  try {
    const fnDetail = await tcApiCall('scf', 'GetFunction', '2018-04-16', {
      FunctionName: FUNCTION_NAME,
      Namespace: ENV_ID,
    });
    if (fnDetail) {
      console.log(`\n函数详情:`);
      console.log(`  名称: ${fnDetail.FunctionName}`);
      console.log(`  运行时: ${fnDetail.Runtime}`);
      console.log(`  状态: ${fnDetail.Status}`);
      console.log(`  类型: ${fnDetail.Type || 'Event'}`);
      if (fnDetail.AccessInfo) {
        console.log(`  访问信息: ${JSON.stringify(fnDetail.AccessInfo)}`);
      }
      // 列出触发器
      if (fnDetail.Triggers) {
        console.log(`  触发器 (${fnDetail.Triggers.length}):`);
        for (const t of fnDetail.Triggers) {
          console.log(`    - ${t.TriggerName} (${t.Type}): ${t.TriggerDesc?.substring(0, 200)}`);
        }
      }
    }
  } catch (err) {
    console.log('  获取函数详情:', err.message);
  }

  // CloudBase HTTP 路由
  try {
    const gwList = await manager.access.getAccessList();
    console.log('\nCloudBase HTTP 路由:');
    if (gwList && gwList.APISet) {
      for (const api of gwList.APISet) {
        console.log(`  ${api.Path} -> ${api.Name} (${api.Type === 1 ? '云函数' : '其他'})`);
      }
    }
    console.log('CloudBase HTTP 服务:', gwList.EnableService ? '已开通' : '未开通 (免费套餐限制)');
  } catch (err) {
    console.log('  获取路由列表:', err.message);
  }

  // CloudBase 域名
  try {
    const domainResult = await manager.access.getDomainList();
    console.log('\nCloudBase 域名:', domainResult.DefaultDomain || 'unknown');
    console.log('CloudBase HTTP 服务:', domainResult.EnableService ? '已开通' : '未开通');
  } catch (err) {
    console.log('  获取域名:', err.message);
  }

  // 总结访问地址
  console.log('\n=== 访问地址 ===');
  if (apiGatewayUrl) {
    console.log(`API Gateway: ${apiGatewayUrl}`);
    console.log(`API (世界状态): ${apiGatewayUrl}api/world`);
  }
  console.log(`CloudBase (需开通HTTP服务): https://${ENV_ID}.service.tcloudbase.com/echoworld`);
  console.log(`控制台: https://console.cloud.tencent.com/tcb/env/access?envId=${ENV_ID}`);
  console.log('\n=== 部署完成 ===');
}

deploy().catch(err => {
  console.error('\n部署失败:', err);
  process.exit(1);
});
