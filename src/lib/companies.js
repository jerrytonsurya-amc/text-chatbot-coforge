export const COMPANIES = {
  Coforge: {
    id: 'Coforge',
    tabLabel: 'Coforge',
    title: 'Coforge Knowledge Assistant',
    welcome: 'Ask questions about Coforge annual reports, investor presentations, and earnings transcripts.',
    placeholder: 'Ask about Coforge financials, earnings, acquisitions...',
    hint: 'Answers are based on Coforge AR, PPT, and Earnings Transcripts',
    suggestions: [
      { title: 'Revenue & Growth', desc: 'What was Coforge revenue growth in FY26?' },
      { title: 'Acquisitions', desc: 'Tell me about the Encora acquisition' },
      { title: 'Margins & Profitability', desc: 'What are Coforge operating margins in FY26?' },
      { title: 'Earnings Highlights', desc: 'Q4 FY26 earnings call key takeaways' },
      { title: 'EPS & Equity Returns', desc: 'What is Coforge earnings per share and return on equity in the latest year?' },
      { title: 'Dividends', desc: 'What dividend has Coforge declared for shareholders recently?' },
      { title: 'Share Capital', desc: 'How has Coforge share capital changed through ESOPs and equity issuance?' },
      { title: 'BFS Sector', desc: 'How is the Banking & Financial Services vertical performing?' },
      { title: 'Vertical Revenue Mix', desc: 'What is Coforge revenue breakdown by industry vertical?' },
      { title: 'Sector Strategy', desc: 'What is Coforge growth strategy across Insurance, Travel, and other verticals?' },
    ],
  },
  CIFC: {
    id: 'CIFC',
    tabLabel: 'Cholamandalam',
    title: 'Cholamandalam (CIFC) Knowledge Assistant',
    welcome: 'Ask questions about Cholamandalam Investment and Finance (CIFC) annual reports, investor presentations, and earnings transcripts.',
    placeholder: 'Ask about CIFC financials, AUM, disbursements, earnings...',
    hint: 'Answers are based on CIFC AR, PPT, and Earnings Transcripts only',
    suggestions: [
      { title: 'Revenue & Growth', desc: 'What was CIFC revenue and AUM growth in FY26?' },
      { title: 'Profitability', desc: 'What are CIFC net profit and ROE in the latest year?' },
      { title: 'Earnings Highlights', desc: 'CIFC Q4 FY26 earnings call key takeaways' },
      { title: 'Disbursements', desc: 'How did CIFC disbursements trend in recent quarters?' },
      { title: 'Asset Quality', desc: 'What is CIFC GNPA and NNPA in the latest period?' },
      { title: 'Funding Mix', desc: 'How is CIFC funded across banks, bonds, and securitization?' },
      { title: 'Vehicle Finance', desc: 'How is CIFC vehicle finance business performing?' },
      { title: 'Investor Presentation', desc: 'Latest CIFC investor presentation strategic highlights' },
      { title: 'Dividends', desc: 'What dividend has CIFC declared for shareholders recently?' },
      { title: 'Guidance', desc: 'What guidance did CIFC management give on the latest earnings call?' },
    ],
  },
};

export const COMPANY_IDS = ['Coforge', 'CIFC'];

export function getCompanyConfig(companyId) {
  return COMPANIES[companyId] || COMPANIES.Coforge;
}
