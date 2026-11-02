// Symbol changes must never relabel another instrument's manual prep snapshot.
export function prepForSymbol(previous,ticker) {
  if ((previous.ticker||'').toUpperCase()===ticker) return previous
  return {...previous,ticker,orbHigh:'',orbLow:'',sessionOpen:'',sessionClose:'',keyLevel:'',plannedStrike:'',plannedDTE:'',plannedContract:null,ivNote:'',gamePlan:'',avoidNotes:'',marketEvents:'',marketSourceDate:null,planningDate:null}
}
