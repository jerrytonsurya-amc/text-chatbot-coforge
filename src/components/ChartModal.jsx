import { useRef } from 'react';
import html2canvas from 'html2canvas';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import './ChartModal.css';

export default function ChartModal({ chartData, onClose }) {
  const chartRef = useRef(null);

  const handleDownload = async () => {
    if (!chartRef.current) return;

    const canvas = await html2canvas(chartRef.current, {
      backgroundColor: '#1a1a1a',
      scale: 2,
    });

    const link = document.createElement('a');
    link.download = `coforge-chart-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const data = chartData.points.map((p) => ({
    name: p.label,
    value: p.value,
  }));

  const useLineChart = chartData.points.length > 4;

  return (
    <div className="chart-modal-overlay" onClick={onClose}>
      <div className="chart-modal" onClick={(e) => e.stopPropagation()}>
        <div className="chart-modal-header">
          <h3>{chartData.title}</h3>
          <button className="chart-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="chart-modal-body" ref={chartRef}>
          <ResponsiveContainer width="100%" height={360}>
            {useLineChart ? (
              <LineChart data={data} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="name" tick={{ fill: '#aaa', fontSize: 12 }} />
                <YAxis tick={{ fill: '#aaa', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ background: '#2a2a2a', border: '1px solid #444', borderRadius: 8 }}
                  labelStyle={{ color: '#fff' }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#19c37d"
                  strokeWidth={2}
                  dot={{ fill: '#19c37d', r: 4 }}
                  name={chartData.valueKey}
                />
              </LineChart>
            ) : (
              <BarChart data={data} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="name" tick={{ fill: '#aaa', fontSize: 12 }} />
                <YAxis tick={{ fill: '#aaa', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ background: '#2a2a2a', border: '1px solid #444', borderRadius: 8 }}
                  labelStyle={{ color: '#fff' }}
                />
                <Bar dataKey="value" fill="#19c37d" radius={[4, 4, 0, 0]} name={chartData.valueKey} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>

        <div className="chart-modal-footer">
          <button className="chart-download-btn" onClick={handleDownload}>
            Download PNG
          </button>
        </div>
      </div>
    </div>
  );
}
