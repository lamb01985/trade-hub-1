import { build } from 'vite'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { uiPreviewOutput } from '../config/ui-preview-output.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const approved='c80c25dec78e8f1b10d701fcedfebc2f3758c9b2'
if (process.env.VERCEL && process.env.VERCEL_ENV !== 'preview') throw new Error('UI_PREVIEW_REQUIRES_PREVIEW_TARGET')
if (Object.keys(process.env).some(k=>k.startsWith('VITE_')&&/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(k)&&process.env[k])) throw new Error('BROWSER_SECRET_VARIABLE_FORBIDDEN')
execFileSync('git',['merge-base','--is-ancestor',approved,'HEAD'],{cwd:root})
await build({root,define:{'import.meta.env.VITE_EDGEIQ_UI_PREVIEW':JSON.stringify('true'),'import.meta.env.VITE_LOCAL_SERVICE_PREVIEW':JSON.stringify('false')},build:{sourcemap:false}})
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?files(path.join(dir,item.name)):[path.join(dir,item.name)])}
const dist=path.join(root,'dist'),artifacts=files(dist)
const secrets=Object.entries(process.env).filter(([name,value])=>/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(name)&&value&&value.length>=8).flatMap(([,value])=>[value,encodeURIComponent(value)])
for(const file of artifacts){
  if(/\.(?:py|pem|env|map)$/.test(file))throw new Error('FORBIDDEN_STATIC_ARTIFACT')
  const content=readFileSync(file)
  if(secrets.some(secret=>content.includes(Buffer.from(secret)))||/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|sk-ant-api03-[A-Za-z0-9_-]{30,}/.test(content.toString()))throw new Error('BUNDLE_SECRET_SCAN_FAILED')
}
const output=path.join(root,'.vercel','output')
if(existsSync(output))rmSync(output,{recursive:true})
mkdirSync(output,{recursive:true})
cpSync(dist,path.join(output,'static'),{recursive:true})
writeFileSync(path.join(output,'config.json'),JSON.stringify(uiPreviewOutput,null,2)+'\n')
const manifest={mode:'PROTECTED_UI_ONLY',approved_base:approved,revision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),services_enabled:[],functions:0,secret_scan:'passed',protection:'MUST_BE_VERIFIED_BEFORE_DEPLOYMENT'}
writeFileSync(path.join(output,'static','ui-preview-manifest.json'),JSON.stringify(manifest,null,2)+'\n')
console.log(JSON.stringify({ui_preview_prepared:true,functions:0,static_artifacts:artifacts.length,secret_scan:'passed',deployment_performed:false}))
