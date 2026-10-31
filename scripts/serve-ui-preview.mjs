// Local artifact-only visual review. This is NOT a substitute for hosted auth.
import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { uiPreviewHeaders } from '../config/ui-preview-output.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../.vercel/output/static')
const port=4191
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'}
http.createServer(async(req,res)=>{
  for(const[key,value]of Object.entries(uiPreviewHeaders))res.setHeader(key,value)
  if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);return res.end()}
  let name;try{name=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname)}catch{res.writeHead(400);return res.end()}
  if(name==='/api'||name.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end('{"error":"ui_preview_service_disabled"}')}
  if(name.includes('\0')||name.split('/').some(part=>part.startsWith('.'))){res.writeHead(404);return res.end()}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end()}
  let file=path.resolve(root,'.'+(name==='/'?'/index.html':name))
  if(!file.startsWith(root+path.sep)){res.writeHead(404);return res.end()}
  try{if(!(await stat(file)).isFile())file=path.join(root,'index.html')}catch{file=path.join(root,'index.html')}
  try{const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:bytes)}catch{res.writeHead(503);res.end()}
}).listen(port,'127.0.0.1',()=>console.log(`Artifact-only UI review: http://127.0.0.1:${port} — hosted authentication is not being simulated.`))
