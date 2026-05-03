import { X } from 'lucide-react';
import { useT } from '../../contexts/ThemeContext';

export function RefImageList({ images, onRemove }: { images: string[]; onRemove: (i: number) => void }) {
  const T = useT();
  if (images.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {images.map((img, i) => (
        <div key={i} style={{ position: 'relative', width: 52, height: 52, borderRadius: 12, overflow: 'hidden', border: `1px solid ${T.border}`, boxShadow: '0 8px 18px rgba(15,23,42,0.08)' }}>
          <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <button onClick={() => onRemove(i)} style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9, background: 'rgba(255,69,58,0.88)', color: '#fff', border: 'none', fontSize: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(15,23,42,0.18)' }}><X size={8} /></button>
        </div>
      ))}
    </div>
  );
}
