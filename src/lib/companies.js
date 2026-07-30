export const APP_CONFIG = {
  title: 'Cholamandalam (CIFC) Knowledge Assistant',
  welcome:
    'Ask questions about Cholamandalam Investment and Finance (CIFC) annual reports, investor presentations, and earnings transcripts.',
  placeholder: 'Ask about CIFC financials, AUM, disbursements, earnings...',
  hint: 'Answers are based on CIFC AR, PPT, and Earnings Transcripts',
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
};

export function getCompanyConfig() {
  return APP_CONFIG;
}
