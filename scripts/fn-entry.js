/**
 * CloudBase 云函数入口
 * 将 HTTP 触发器的请求转发给 Express app
 */
const app = require('./dist/index');

exports.main = async (event, context) => {
  // 如果是 HTTP 触发器，event 包含 httpMethod、path、headers、body 等
  if (event.httpMethod) {
    return new Promise((resolve) => {
      const { httpMethod, path: reqPath, headers, body, queryStringParameters } = event;

      // 构造请求对象
      const queryString = queryStringParameters
        ? Object.entries(queryStringParameters).map(([k, v]) => `${k}=${v}`).join('&')
        : '';
      const url = queryString ? `${reqPath}?${queryString}` : reqPath;

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

  // 非 HTTP 触发器
  return { message: 'EchoWorld is running', event };
};
