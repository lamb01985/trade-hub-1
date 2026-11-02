// Canonical release replaces alternate application-mode switches. Authentication
// admission remains covered by operator-gate and provider-access regressions.
import {readFileSync} from 'node:fs'
import {it,expect} from 'vitest'
it('has one canonical product entry regardless of query flags',()=>{
 const app=readFileSync('src/App.jsx','utf8')
 expect(app).toContain('export default function App() { return <LegacyApp/> }')
 expect(app).toContain('const VERIFIED_WORKFLOW = true')
 expect(app).not.toContain('return <ReadinessDesk')
 expect(readFileSync('src/main.jsx','utf8')).toContain('<OperatorGate><App /></OperatorGate>')
})
