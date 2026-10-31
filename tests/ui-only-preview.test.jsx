// @vitest-environment jsdom
import {cleanup,render,screen,fireEvent} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {installUiPreviewFence} from '../src/lib/uiPreview.js'
import OperatorGate from '../src/components/OperatorGate.jsx'
import {ProviderPolling} from '../src/lib/providerPolling.js'
import {uiPreviewOutput} from '../config/ui-preview-output.mjs'
import configuration from '../vercel.json' with {type:'json'}
afterEach(()=>{cleanup();vi.unstubAllEnvs();vi.unstubAllGlobals()})
it('publishes only static routes with an unconditional API denial and disables automatic Git deployments',()=>{
 expect(configuration.git.deploymentEnabled).toBe(false);expect(configuration.ignoreCommand).toBe('exit 0')
 expect(uiPreviewOutput).not.toHaveProperty('functions');expect(uiPreviewOutput.routes[0].status).toBe(503)
 for(const path of ['/api','/api/polygon/ws-auth','/api/schwab/auth/login','/api/_lib/polygon.js','/api/thesis/company'])expect(new RegExp(`^${uiPreviewOutput.routes[0].src}$`).test(path)).toBe(true)
 expect(uiPreviewOutput.routes[0].headers['Content-Security-Policy']).toContain("connect-src 'none'")
})
it('blocks every fetch without invoking the original transport and returns honest unavailability',async()=>{
 vi.stubEnv('VITE_EDGEIQ_UI_PREVIEW','true');const original=vi.fn(),target={fetch:original};installUiPreviewFence(target)
 for(const url of ['/api/polygon/proxy','/api/schwab/account','https://api.anthropic.com/v1/messages']){const response=await target.fetch(url,{method:'POST',body:'private input'});expect(response.status).toBe(503);expect(await response.json()).toMatchObject({error:'ui_preview_service_disabled'})}
 expect(original).not.toHaveBeenCalled()
})
it('preserves operator authentication in ordinary builds and requires no operator-secret delivery in static UI mode',()=>{
 vi.stubEnv('VITE_EDGEIQ_UI_PREVIEW','true');vi.stubGlobal('fetch',vi.fn());render(<OperatorGate><p>Approved UI</p></OperatorGate>);expect(screen.getByText('Approved UI')).toBeTruthy();expect(fetch).not.toHaveBeenCalled()
})
it('never reports a connected feed or starts polling in UI-only mode',()=>{
 vi.stubEnv('VITE_EDGEIQ_UI_PREVIEW','true');const request=vi.fn(),connected=vi.fn(),disconnected=vi.fn();const polling=new ProviderPolling({onConnected:connected,onDisconnected:disconnected},request);polling.connect();polling.subscribe('QQQ');expect(connected).not.toHaveBeenCalled();expect(disconnected).toHaveBeenCalled();expect(request).not.toHaveBeenCalled();expect(polling.running).toBe(false);polling.disconnect()
})
