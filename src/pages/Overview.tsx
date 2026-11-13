/* Overview: the final reference video of every Konzept with its thumbnail and description.
   Reference only: these videos are never uploaded (uploads are fresh Gen videos in Results). */
import React, { useEffect, useState } from 'react';
import { useApp } from '../ctx';
import { kColor } from '../logic';
import { Header } from './parts';
import { Icon } from '../ui';
import { Player, type Marker } from '../player';
import { bb, isDesktop, type FinalVideo } from '../bridge';
import { CONCEPTS } from '../overview';

export default function Overview() {
  const { toast } = useApp();
  const [finals, setFinals] = useState<FinalVideo[] | null>(null);
  const [sel, setSel] = useState<string>(CONCEPTS[0].id);
  const [markers, setMarkers] = useState<Record<string, Marker[]>>({});
  useEffect(() => { let on = true; (bb.finals ? bb.finals() : Promise.resolve([])).then((f) => { if (on) setFinals(f); }).catch(() => on && setFinals([])); return () => { on = false; }; }, []);
  const byId = new Map((finals ?? []).map((f) => [f.id.toLowerCase(), f]));
  const list = CONCEPTS.map((c) => ({ c, f: byId.get(c.id.toLowerCase()) }));
  const cur = list.find((x) => x.c.id === sel) ?? list[0];
  const copy = async (t: string) => { await bb.copyText(t); toast('Description copied'); };
  return <>
    <Header title="Overview" sub={`${finals ? list.filter((x) => x.f).length : '…'} final Konzept videos · reference only, never uploaded`} right={isDesktop ? <button className="btn sm" onClick={() => bb.openVault('Konzepte')}><Icon name="folder" size={14} /> Konzepte</button> : undefined} />
    {!isDesktop && <div className="glass card"><div className="empty">The final videos live in the vault on the PC. Open the Overview in the Windows launcher to watch them.</div></div>}
    {isDesktop && <div className="ov-detail glass card">
      <div className="ov-player">
        {cur.f ? <Player key={cur.c.id} src={bb.fileUrl(cur.f.video)} active markers={markers[cur.c.id] ?? []} onMarkers={(m) => setMarkers((s) => ({ ...s, [cur.c.id]: m }))} />
          : <div className="ov-missing">{finals ? 'Final video not found in the vault' : 'Loading…'}</div>}
      </div>
      <div className="ov-info">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span className="chip" style={{ background: kColor(cur.c.k) + '33', color: kColor(cur.c.k) }}><span className="dot" style={{ background: kColor(cur.c.k) }} />{cur.c.id}</span>
          <span className="chip ov-ref">Reference only · not for upload</span>
        </div>
        <h2 className="ov-title">{cur.c.name}</h2>
        <p className="ov-about">{cur.c.about}</p>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{cur.c.facts.map((t) => <span key={t} className="chip">{t}</span>)}</div>
        <div className="ov-sec">
          <div className="between"><b className="small">Video description</b>{cur.f?.description && <button className="btn sm icon" onClick={() => copy(cur.f!.description)} title="Copy description" aria-label="Copy description"><Icon name="copy" size={14} /></button>}</div>
          <p className="ov-desc">{cur.f?.description || <span className="dim">No description file</span>}</p>
        </div>
        <div className="ov-sec">
          <b className="small">Thumbnail</b>
          {cur.f?.thumb ? <img className="ov-thumb" src={bb.fileUrl(cur.f.thumb)} alt={`${cur.c.name} thumbnail`} /> : <span className="small dim">No thumbnail file</span>}
        </div>
        {cur.f && <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={() => bb.openPath(cur.f!.folder)}><Icon name="folder" size={14} /> Open folder</button>
          <span className="small dim">{(cur.f.size / 1048576).toFixed(1)} MB</span>
        </div>}
      </div>
    </div>}
    <div className="lib ov-grid">
      {list.map(({ c, f }) => {
        const url = f?.thumb ? bb.fileUrl(f.thumb) : '';
        return <button key={c.id} className={`glass card ov-card ${sel === c.id ? 'on' : ''}`} onClick={() => { setSel(c.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} aria-label={`${c.id} ${c.name}`}>
          <div className="poster" style={{ backgroundImage: url ? `url("${url}")` : undefined }}>
            {!url && <div className="ball" />}
            <span className="tag"><span className="chip" style={{ background: 'rgba(0,0,0,.6)' }}><span className="dot" style={{ background: kColor(c.k) }} />{c.id}</span></span>
            <span className="ov-play"><Icon name="play" size={18} /></span>
          </div>
          <b className="ov-name">{c.name}</b>
          <span className="small muted ov-short">{c.about}</span>
        </button>;
      })}
    </div>
  </>;
}
