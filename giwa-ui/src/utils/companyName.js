const demoCompanyLabels = new Map([
  ['Midnight Synthetic Demo seller', '가상 판매기업'],
  ['Midnight Synthetic Demo buyer', '가상 구매기업'],
  ['Midnight Synthetic Demo funder', '가상 검증기업'],
])

// Display aliases only: preserve original company names and identifiers in app state.
export function displayCompanyName(value) {
  return demoCompanyLabels.get(value) ?? value
}
