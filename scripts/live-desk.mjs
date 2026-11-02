// Dedicated loopback read-only launcher. No persistent credentials are created or changed.
import { createServer, loadEnv } from 'vite'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const repair=process.env.TRADEHUB_LEVEL_REPAIR==='true'
const envDir=process.env.TRADEHUB_SERVER_ENV_DIR||(repair?path.resolve(root,'../tradehub-monday-readiness'):root)
const config=loadEnv('development',envDir,'')
// Only market configuration is imported, never broker or AI credentials.
for(const key of ['POLYGON_API_KEY','MASSIVE_API_KEY','MASSIVE_BUDGET_ENFORCED','MASSIVE_BUDGET_REDIS_REST_URL','MASSIVE_BUDGET_REDIS_REST_TOKEN','MASSIVE_ACCOUNT_BUDGET_SCOPE','MASSIVE_REQUESTS_PER_MINUTE','MASSIVE_LEGACY_RESERVED_REQUESTS_PER_MINUTE']) if(!process.env[key]&&config[key])process.env[key]=config[key]
const cookie=repair?'th_level_repair_operator':'th_desk_operator'
const port=repair?4210:4190,origin=`http://127.0.0.1:${port}`
Object.assign(process.env,{NODE_ENV:'development',TRADEHUB_LOCAL_DESK:'true',TRADEHUB_LOCAL_PREVIEW:'true',TRADEHUB_LOCAL_AUTH:'true',TRADEHUB_APP_ORIGIN:origin,TRADEHUB_OPERATOR_ID:'local-readonly-desk'})
const vite=await createServer({root,define:{'import.meta.env.VITE_VERIFIED_LEVEL_WORKFLOW':JSON.stringify(repair?'true':'false')},server:{host:'127.0.0.1',port,strictPort:true},plugins:[{
  name:'local-readonly-desk',configureServer(server){server.middlewares.use(async(req,res,next)=>{
    res.setHeader('Cache-Control','private, no-store')
    if(req.headers.host!==`127.0.0.1:${port}` || req.headers.origin&&req.headers.origin!==origin || req.headers['sec-fetch-site']==='cross-site'){res.statusCode=403;return res.end('Loopback origin required')}
    const url=new URL(req.url,origin)
    // A process-local session cookie allows only the read routes below. It is never logged.
    if(url.pathname==='/'&&req.method==='GET'){
      const access=await server.ssrLoadModule('/api/_lib/access.js')
      try{await access.requireOperator(req)}catch{
        const id=crypto.randomBytes(32).toString('hex')
        const hash=crypto.createHash('sha256').update(id).digest('hex')
        await access.stateSet(`th:operator:session:${hash}`,{operator:'local-readonly-desk'},8*3600)
        res.setHeader('Set-Cookie',`${cookie}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`)
      }
      return next()
    }
    if(!url.pathname.startsWith('/api/'))return next()
    res.status=code=>{res.statusCode=code;return res};res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return res};res.send=value=>{res.end(value);return res}
    if(req.method!=='GET')return res.status(405).json({error:'READ_ONLY_DESK'})
    if(!['/api/desk','/api/polygon/proxy','/api/intelligence/session'].includes(url.pathname))return res.status(403).json({error:'READ_ONLY_DESK'})
    req.query=Object.fromEntries([...new Set(url.searchParams.keys())].map(k=>[k,url.searchParams.getAll(k).length===1?url.searchParams.get(k):url.searchParams.getAll(k)]))
    // Proxy restricted to the options chain; watchlist and bars use normalized desk route.
    if(url.pathname==='/api/polygon/proxy'&&!/^\/v3\/snapshot\/options\/(QQQ|SPY|IWM|NVDA|AMD|MU|PLTR|TSLA|ORCL|CRWV)$/.test(req.query.path||''))return res.status(403).json({error:'READ_ONLY_DESK'})
    try{
      if(url.pathname==='/api/intelligence/session'){const a=await server.ssrLoadModule('/api/_lib/access.js');try{await a.requireOperator(req);return res.json({authenticated:true})}catch{return res.json({authenticated:false})}}
      const mod=await server.ssrLoadModule(url.pathname==='/api/desk'?'/api/desk.js':'/api/polygon/proxy.js');await mod.default(req,res)
    }catch{if(!res.writableEnded)res.status(503).json({error:'local_desk_unavailable'})}
  })}
}]})
await vite.listen()
console.log(repair?`TradeHub Level Map repair: ${origin}/`:`Read-only TradeHub desk: ${origin}/?desk=live`)
console.log(`Server provider key: ${process.env.POLYGON_API_KEY||process.env.MASSIVE_API_KEY?'configured (access unverified)':'missing'}. AI, broker and notification routes blocked.`)
