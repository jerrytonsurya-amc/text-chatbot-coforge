import { useMemo, useState } from 'react';
import ChartModal from './ChartModal';
import { extractTableFromReactChildren } from '../lib/extractTableFromReact';
import { tableToChartData } from '../lib/parseTable';
import './ChartModal.css';

export default function TableWithChart({ children }) {
  const [showChart, setShowChart] = useState(false);

  const chartData = useMemo(() => {
    const table = extractTableFromReactChildren(children);
    return tableToChartData(table);
  }, [children]);

  const canChart = Boolean(chartData?.points?.length);

  return (
    <div className="table-block">
      {canChart && (
        <div className="table-toolbar">
          <button
            type="button"
            className="view-chart-btn"
            onClick={() => setShowChart(true)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3v18h18" />
              <path d="M7 16l4-6 4 3 5-8" />
            </svg>
            View in Chart
          </button>
        </div>
      )}
      <div className="table-wrapper">
        <table>{children}</table>
      </div>
      {showChart && (
        <ChartModal chartData={chartData} onClose={() => setShowChart(false)} />
      )}
    </div>
  );
}
