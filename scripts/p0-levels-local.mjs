// Loopback-only provider acceptance. Reads existing market configuration;
// ephemeral read-only session only, no hosted credential or setting changes.
import {createServer,loadEnv} from 'vite'
import crypto from 'node:crypto'
const root=new URL('../',import.meta.url).pathname
const env=loadEnv('development',new URL('../../tradehub-monday-readiness/',import.meta.url).pathname,'')
if(!process.env.POLYGON_API_KEY)process.env.POLYGON_API_KEY=env.POLYGON_API_KEY||env.MASSIVE_API_KEY
const origin='http://127.0.0.1:4218'
Object.assign(process.env,{NODE_ENV:'development',TRADEHUB_LOCAL_AUTH:'true',TRADEHUB_APP_ORIGIN:origin,TRADEHUB_OPERATOR_ID:'local-p0-readonly'})
const server=await createServer({root,server:{host:'127.0.0.1',port:4218,strictPort:true},plugins:[{name:'p0-readonly',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
  if(req.headers.host!=='127.0.0.1:4218'||req.headers.origin&&req.headers.origin!==origin){res.statusCode=403;return res.end()}
  const url=new URL(req.url,origin)
  if(!url.pathname.startsWith('/api/')){
    if(url.pathname==='/'){
      const access=await vite.ssrLoadModule('/api/_lib/access.js')
      try{await access.requireOperator(req)}catch{
        const id=crypto.randomBytes(32).toString('hex'),hash=crypto.createHash('sha256').update(id).digest('hex')
        await access.stateSet(`th:operator:session:${hash}`,{operator:'local-p0-readonly'},28800)
        res.setHeader('Set-Cookie',`th_p0_operator=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`)
      }
    }
    return next()
  }
  res.status=code=>{res.statusCode=code;return res};res.json=body=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));return res}
  if(req.method!=='GET'||url.pathname!=='/api/desk')return res.status(403).json({error:'LOCAL_READ_ONLY'})
  req.query=Object.fromEntries(url.searchParams)
  try{await(await vite.ssrLoadModule('/api/desk.js')).default(req,res)}catch{return res.status(503).json({error:'LOCAL_UNAVAILABLE'})}
})}}]})
await server.listen();console.log(`P0 local acceptance: ${origin}. Broker, AI, notification and legacy provider routes blocked.`)
