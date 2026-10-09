import React, { useState, useEffect } from 'react';
import { 
  Server, Database, Network, ShieldCheck, ArrowRight, 
  Lock, RefreshCw, Cpu, Activity, AlertCircle, CheckCircle2
} from 'lucide-react';

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/cluster-status');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  const env = data?.env || 'Production';
  const isDev = env.toLowerCase() === 'dev';

  return (
    <div style={{ minHeight: '100vh', background: '#0c1222', color: '#e2e8f0', padding: '24px 32px' }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: '20px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'linear-gradient(135deg, #0284c7, #0369a1)', padding: '10px', borderRadius: '10px', display: 'flex' }}>
            <Network size={28} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '700' }}>ClusterMesh 2-Tier VPC Architecture</h1>
            <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>Option 3: Web on EC2 + Dedicated Database on EC2 in Private Subnet</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ 
            background: isDev ? 'rgba(234, 179, 8, 0.15)' : 'rgba(14, 165, 233, 0.15)', 
            color: isDev ? '#eab308' : '#38bdf8', 
            border: `1px solid ${isDev ? '#eab308' : '#38bdf8'}`,
            padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '600'
          }}>
            {env.toUpperCase()} ENVIRONMENT
          </span>

          <span style={{ background: '#1e293b', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Lock size={14} color="#38bdf8" /> VPC Subnet Isolated
          </span>
        </div>
      </header>

      {/* Main Diagram & Status */}
      <main style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Visual 2-Tier Architecture Pipeline */}
        <div style={{ background: '#111c35', border: '1px solid #1e293b', borderRadius: '16px', padding: '28px' }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', fontWeight: '600', color: '#f8fafc' }}>
            Inter-tier Communication Topology (Public to Private Subnet)
          </h3>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            {/* Tier 1: Web Tier */}
            <div style={{ flex: 1, minWidth: '280px', background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', color: '#38bdf8', fontWeight: '600' }}>TIER 1 • PUBLIC SUBNET</span>
                <Server size={20} color="#38bdf8" />
              </div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#ffffff' }}>Web Instance (EC2)</div>
              <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '6px' }}>Docker Engine + React Container</div>
              <div style={{ marginTop: '14px', padding: '8px 12px', background: '#0f172a', borderRadius: '6px', fontSize: '12px', color: '#22c55e' }}>
                ● Status: Running (Port 80)
              </div>
            </div>

            {/* Connection Arrow */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#64748b', padding: '0 10px' }}>
              <span style={{ fontSize: '11px', color: '#38bdf8', marginBottom: '4px', fontWeight: '600' }}>Port 3306 (TCP)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ height: '2px', width: '40px', background: '#38bdf8' }}></div>
                <ArrowRight size={20} color="#38bdf8" />
              </div>
              <span style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>Private Security Group</span>
            </div>

            {/* Tier 2: DB Tier */}
            <div style={{ flex: 1, minWidth: '280px', background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', color: '#a855f7', fontWeight: '600' }}>TIER 2 • PRIVATE SUBNET</span>
                <Database size={20} color="#a855f7" />
              </div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#ffffff' }}>Database Instance (EC2)</div>
              <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '6px' }}>MariaDB / MySQL Dedicated Host</div>
              <div style={{ marginTop: '14px', padding: '8px 12px', background: '#0f172a', borderRadius: '6px', fontSize: '12px', color: data?.dbConnected ? '#22c55e' : '#f59e0b' }}>
                {data?.dbConnected ? '● Connected via Private IP' : '● Standby / Connecting...'}
              </div>
            </div>
          </div>
        </div>

        {/* Real-time Query & Diagnostic Panel */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '20px' }}>
          
          <div style={{ gridColumn: 'span 8', background: '#111c35', border: '1px solid #1e293b', borderRadius: '12px', padding: '24px' }}>
            <h4 style={{ margin: '0 0 16px 0', fontSize: '15px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={16} color="#38bdf8" />
              Dedicated Database Server Details
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
              <div style={{ background: '#1e293b', padding: '14px', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>DATABASE HOST</div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#38bdf8', marginTop: '4px' }}>
                  {data?.dbHost || '10.0.2.145 (Private Subnet)'}
                </div>
              </div>
              <div style={{ background: '#1e293b', padding: '14px', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>SQL QUERY LATENCY</div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#22c55e', marginTop: '4px' }}>
                  {data?.latencyMs || '1.2'} ms (Intra-VPC)
                </div>
              </div>
              <div style={{ background: '#1e293b', padding: '14px', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>FIREWALL / SECURITY GROUP</div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#a855f7', marginTop: '4px' }}>
                  Inbound only from Web SG
                </div>
              </div>
              <div style={{ background: '#1e293b', padding: '14px', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>INTERNET ACCESSIBILITY</div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#ef4444', marginTop: '4px' }}>
                  BLOCKED (Zero Public IP)
                </div>
              </div>
            </div>
          </div>

          <div style={{ gridColumn: 'span 4', background: '#111c35', border: '1px solid #1e293b', borderRadius: '12px', padding: '24px' }}>
            <h4 style={{ margin: '0 0 16px 0', fontSize: '15px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={16} color="#22c55e" />
              SRE Review & Domain
            </h4>
            <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6' }}>
              <p style={{ margin: '0 0 10px 0' }}><strong>Subdomain:</strong> <code style={{ color: '#38bdf8' }}>{isDev ? 'opt3-dev.png261.dev' : 'opt3.png261.dev'}</code></p>
              <p style={{ margin: '0 0 10px 0' }}><strong>Compute:</strong> 2x EC2 Instances</p>
              <p style={{ margin: '0 0 10px 0' }}><strong>Chi phí hạ tầng:</strong> ~$43.96/tháng</p>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px' }}>Tách biệt hoàn toàn tài nguyên CPU/RAM cho ứng dụng web và DB, nâng cao bảo mật và hiệu năng.</p>
            </div>
          </div>

        </div>

      </main>
    </div>
  );
}
