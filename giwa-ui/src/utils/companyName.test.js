import { describe, expect, it } from 'vitest'
import { displayCompanyName } from './companyName'

describe('displayCompanyName', () => {
  it.each([
    ['Midnight Synthetic Demo seller', '가상 판매기업'],
    ['Midnight Synthetic Demo buyer', '가상 구매기업'],
    ['Midnight Synthetic Demo funder', '가상 검증기업'],
  ])('shortens only the known fixture name %s', (name, label) => {
    expect(displayCompanyName(name)).toBe(label)
  })

  it.each([
    '실제 판매 주식회사',
    'Midnight Finance',
    'Midnight Synthetic Demo seller Holdings',
    'Midnight Synthetic Demo Seller',
    ' Midnight Synthetic Demo seller',
    'Midnight Synthetic Demo seller ',
    'toString',
    '',
    null,
    undefined,
  ])('preserves other company names and missing values: %s', (name) => {
    expect(displayCompanyName(name)).toBe(name)
  })
})
