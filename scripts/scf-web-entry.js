/**
 * SCF Web Function 入口
 * 直接启动 Express 服务器监听 PORT 端口（默认 9000）
 */
const app = require('./dist/index');
const port = process.env.PORT || 9000;

app.listen(port, '0.0.0.0', () => {
  console.log(`[EchoWorld] SCF Web Function running on port ${port}`);
});
