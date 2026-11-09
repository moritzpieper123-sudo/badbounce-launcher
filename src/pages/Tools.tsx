import React from 'react';
import { useApp } from '../ctx';
import { Header } from './parts';
import { Icon } from '../ui';
import { bb, isDesktop } from '../bridge';
import { TikTokLogo, ClaudeLogo, GeminiLogo, ChatGPTLogo, Badge } from '../logos';

export default function Tools() {
  const { snap, toast } = useApp();
  const claude = async (cmd: string) => { await bb.copyText(cmd); await bb.openUrl(snap.state.settings.projectUrl); toast(`"${cmd}" copied · paste it into the project chat`); };
  const skills = [
    { cmd: 'Gen', hint: 'One new video: pick an idea, frame, render' },
    { cmd: 'Gen x3', hint: 'Batch of 3 videos' },
    { cmd: 'Gen x5', hint: 'Batch of 5 videos' },
    { cmd: 'NewStyle', hint: 'Add a new Konzept' },
    { cmd: 'OPT', hint: 'Optimise a Konzept or the launcher' },
  ];
  const links = [
    { label: 'TikTok', sub: '@badb0unce', url: 'https://www.tiktok.com/@badb0unce', logo: <TikTokLogo />, glow: 'rgba(37,244,238,.25)' },
    { label: 'Studio', sub: 'Upload', url: 'https://www.tiktok.com/tiktokstudio/upload', logo: <><TikTokLogo /><Badge color="#FFC63A"><Icon name="upload" size={11} color="#1A1404" sw={2.6} /></Badge></>, glow: 'rgba(255,198,58,.25)' },
    { label: 'Studio', sub: 'Analytics', url: 'https://www.tiktok.com/tiktokstudio/analytics', logo: <><TikTokLogo /><Badge color="#7FD9A8"><Icon name="chart" size={11} color="#0B2016" sw={2.6} /></Badge></>, glow: 'rgba(127,217,168,.25)' },
    { label: 'Claude', sub: 'Project', url: snap.state.settings.projectUrl, logo: <ClaudeLogo />, glow: 'rgba(217,119,87,.3)' },
    { label: 'Gemini', sub: 'Chat', url: 'https://gemini.google.com/app', logo: <GeminiLogo />, glow: 'rgba(155,114,203,.3)' },
    { label: 'ChatGPT', sub: 'Chat', url: 'https://chatgpt.com/', logo: <ChatGPTLogo />, glow: 'rgba(var(--wrgb),.18)' },
  ];
  const folders = [['Vault', ''], ['Results', 'Results'], ['Konzepte', 'Konzepte'], ['Branding', 'Branding'], ['Analytics', 'Analytics'], ['Ideas', 'Ideas'], ['Backups', '.claude-workspace/launcher-data/backups']];
  return <>
    <Header title="Tools" sub="Claude commands are copied and the project opens; you paste and send." />
    <div className="glass card">
      <h2>Quick links</h2>
      <div className="logo-grid">
        {links.map((l) => <button key={l.url} className="logo-tile" onClick={() => bb.openUrl(l.url)} aria-label={`${l.label} ${l.sub}`} style={{ ['--g' as string]: l.glow }}>
          <span className="logo-disc">{l.logo}</span>
          <span className="logo-name">{l.label}</span>
          <span className="small dim">{l.sub}</span>
        </button>)}
      </div>
    </div>
    <section className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
      <div className="glass card"><div className="row" style={{ gap: 10 }}><ClaudeLogo size={22} /><h2>Claude commands</h2></div>{skills.map((s) => <div key={s.cmd} className="row" style={{ justifyContent: 'space-between' }}><div><b>{s.cmd}</b><div className="small dim">{s.hint}</div></div><button className="btn sm primary" onClick={() => claude(s.cmd)}><Icon name="play" size={12} /> Run</button></div>)}</div>
      {isDesktop && <div className="glass card"><div className="row" style={{ gap: 10 }}><Icon name="folder" size={20} color="var(--yellow)" /><h2>Folders</h2></div>
        <div className="folder-grid">{folders.map(([l, p]) => <button key={l} className="btn" style={{ justifyContent: 'flex-start', gap: 8 }} onClick={() => bb.openVault(p)}><Icon name="folder" size={14} />{l}</button>)}</div>
      </div>}
    </section>
  </>;
}
