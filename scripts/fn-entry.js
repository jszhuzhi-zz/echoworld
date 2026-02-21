/**
 * CloudBase 云函数入口
 * 将 HTTP 触发器的请求转发给 Express app
 * 也支持直接返回 HTML 页面 (作为静态托管的 fallback)
 */
const path = require('path');
const fs = require('fs');
const app = require('./dist/index');

exports.main = async (event, context) => {
  // 如果是 HTTP 触发器，event 包含 httpMethod、path、headers、body 等
  if (event.httpMethod) {
    // 如果请求根路径或 index.html，直接返回 HTML 文件
    const reqPath = event.path || '/';
    if (reqPath === '/' || reqPath === '/index.html') {
      try {
        const htmlPath = path.join(__dirname, 'public', 'index.html');
        if (fs.existsSync(htmlPath)) {
          const html = fs.readFileSync(htmlPath, 'utf8');
          return {
            isBase64Encoded: false,
            statusCode: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
            body: html,
          };
        }
      } catch (e) {
        // Fallback to Express
      }
    }

    return new Promise((resolve) => {
      const { httpMethod, path: eventPath, headers, body, queryStringParameters } = event;

      // 构造请求对象
      const queryString = queryStringParameters
        ? Object.entries(queryStringParameters).map(([k, v]) => `${k}=${v}`).join('&')
        : '';
      const url = queryString ? `${eventPath}?${queryString}` : eventPath;

      const req = new (require('http').IncomingMessage)();
      req.method = httpMethod;
      req.url = url;
      req.headers = headers || {};
      if (body) {
        req.push(typeof body === 'string' ? body : JSON.stringify(body));
      }
      req.push(null);

      // 构造响应对象
      const chunks = [];
      const res = new (require('http').ServerResponse)(req);
      const originalWrite = res.write.bind(res);
      const originalEnd = res.end.bind(res);

      res.write = (chunk) => {
        chunks.push(Buffer.from(chunk));
        return true;
      };

      res.end = (chunk) => {
        if (chunk) chunks.push(Buffer.from(chunk));
        const bodyStr = Buffer.concat(chunks).toString('utf8');
        resolve({
          isBase64Encoded: false,
          statusCode: res.statusCode || 200,
          headers: res.getHeaders ? res.getHeaders() : {},
          body: bodyStr,
        });
      };

      app.handle(req, res);
    });
  }

  // 非 HTTP 触发器 - 如果请求 HTML 页面
  if (event.getPage || event.action === 'getPage') {
    try {
      const htmlPath = path.join(__dirname, 'public', 'index.html');
      if (fs.existsSync(htmlPath)) {
        return {
          html: fs.readFileSync(htmlPath, 'utf8'),
          status: 'ok',
        };
      }
    } catch (e) {
      return { error: e.message };
    }
  }

  return { message: 'EchoWorld is running', event };
};
