import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import dotenv from 'dotenv';

// Load local environment variables for Vite dev server
dotenv.config({ path: '.env.local' });
dotenv.config();

function devApiMiddleware(): Plugin {
  return {
    name: 'dev-api-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/api/analyze' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', (chunk) => {
            bodyStr += chunk;
          });
          req.on('end', async () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
                               (req.headers['x-real-ip'] as string) ||
                               req.socket?.remoteAddress ||
                               '127.0.0.1';
              const module = await server.ssrLoadModule('/api/analyze.ts');
              const result = await module.processAnalyzeRequest(body.service, body.prompt, clientIp);
              
              res.statusCode = result.status;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result.body));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: '本地 API 處理錯誤: ' + (err.message || '未知錯誤') }));
            }
          });
          return;
        }

        if (req.url === '/api/ntpc-youbike' && req.method === 'GET') {
          try {
            const module = await server.ssrLoadModule('/api/ntpc-youbike.ts');
            const result = await module.processNtpcRequest();
            res.statusCode = result.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result.body));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: '新北市代理端點錯誤: ' + (err.message || '未知錯誤') }));
          }
          return;
        }

        if (req.url === '/api/kcg-youbike' && req.method === 'GET') {
          try {
            const module = await server.ssrLoadModule('/api/kcg-youbike.ts');
            const result = await module.processKcgRequest();
            res.statusCode = result.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result.body));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: '高雄市代理端點錯誤: ' + (err.message || '未知錯誤') }));
          }
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), devApiMiddleware()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
