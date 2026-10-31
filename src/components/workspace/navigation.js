import { LayoutDashboard, ChartCandlestick, Building2, Bookmark, Layers3, ScanLine, BookOpen, CalendarDays, SlidersHorizontal, BriefcaseBusiness, Telescope, Sigma, Library, ListChecks, Activity, PieChart, Target, Workflow, Calculator, Gauge, NotebookPen, Waypoints, CircleHelp, Sparkles } from 'lucide-react'
export const PRIMARY_NAV = [
  {id:'overview',label:'Overview',icon:LayoutDashboard,tab:'overview'},
  {id:'plan:calendar',label:'Events',icon:CalendarDays,tab:'plan',sub:'calendar'},
  {id:'opportunities',label:'Opportunities',icon:Telescope,tab:'opportunities'},
  {id:'company',label:'Company Intelligence',icon:Building2,tab:'company'},
  {id:'trade:chart',label:'Trading Desk',icon:ChartCandlestick,tab:'trade',sub:'chart'},
  {id:'portfolio',label:'Portfolio',icon:BriefcaseBusiness,tab:'portfolio'},
  {id:'review:journal',label:'Journal & Strategies',icon:NotebookPen,tab:'review',sub:'journal'},
]
export const NAV_GROUPS = [
  {label:'Research',icon:Telescope,items:[
    {id:'plan:intelligence',label:'Market intelligence',icon:Layers3,tab:'plan',sub:'intelligence'},
    {id:'rotation',label:'Sector rotation',icon:Layers3,tab:'plan',sub:'intelligence',intelligence:'rotation'},
    {id:'compare',label:'Compare companies',icon:Waypoints,tab:'company',view:'compare'},
    {id:'review:research',label:'Research outcomes',icon:NotebookPen,tab:'review',sub:'research'},
  ]},
  {label:'Trading tools',icon:ChartCandlestick,items:[
    {id:'plan:prep',label:'Session prep',icon:ListChecks,tab:'plan',sub:'prep'},
    {id:'plan:levels',label:'Key levels',icon:Layers3,tab:'plan',sub:'levels'},
    {id:'plan:setups',label:'Setups & core playbook',icon:Target,tab:'plan',sub:'setups'},
    {id:'trade:bot',label:'Trading engine',icon:Workflow,tab:'trade',sub:'bot'},
    {id:'trade:orb',label:'Opening range',icon:Activity,tab:'trade',sub:'orb'},
    {id:'trade:iv',label:'Options & volatility',icon:Sigma,tab:'trade',sub:'iv'},
    {id:'trade:calc',label:'Position calculator',icon:Calculator,tab:'trade',sub:'calc'},
    {id:'trade:command',label:'Connections & risk',icon:SlidersHorizontal,tab:'trade',sub:'command'},
  ]},
  {label:'Watchlists & discovery',icon:ScanLine,items:[
    {id:'plan:watchlist',label:'Watchlists',icon:Bookmark,tab:'plan',sub:'watchlist'},
    {id:'plan:focus',label:'Focused tickers',icon:Target,tab:'plan',sub:'focus'},
    {id:'plan:movers',label:'Market movers',icon:ScanLine,tab:'plan',sub:'movers'},
    {id:'plan:universe',label:'Universe builder',icon:Library,tab:'plan',sub:'universe'},
    {id:'plan:wheel',label:'Wheel scanner',icon:Gauge,tab:'plan',sub:'wheel'},
  ]},
  {label:'Review & resources',icon:BookOpen,items:[
    {id:'review:outcomes',label:'Setup outcomes',icon:Activity,tab:'review',sub:'outcomes'},
    {id:'review:stats',label:'Trading statistics',icon:PieChart,tab:'review',sub:'stats'},
    {id:'plan:playbook',label:'Trading playbook',icon:BookOpen,tab:'plan',sub:'playbook'},
    {id:'plan:glossary',label:'Glossary',icon:CircleHelp,tab:'plan',sub:'glossary'},
  ]},
]
export const ALL_NAV = [...PRIMARY_NAV,...NAV_GROUPS.flatMap(group=>group.items)]
export function activeNavigation(tab, sub, companyView='company') {
  if(tab==='company')return ALL_NAV.find(item=>item.id===(companyView==='compare'?'compare':'company'))
  return ALL_NAV.find(item=>item.id===(sub?`${tab}:${sub}`:tab)) || PRIMARY_NAV[0]
}
