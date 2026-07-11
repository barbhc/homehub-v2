// Minimal Lucide icon wrapper — uses the Lucide CDN's lucide.icons object.
// Each icon is an array of [tag, attrs, ...] nodes we render as SVG children.

function Icon({ name, size = 20, strokeWidth = 2, style, className }) {
  const lucide = (typeof window !== 'undefined') && window.lucide;
  const icon = lucide && lucide.icons && (lucide.icons[name] || lucide.icons[toPascal(name)]);
  if (!icon) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" style={style} className={className}>
        <rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth={strokeWidth} />
      </svg>
    );
  }
  // icon shape: [ [tag, attrs], [tag, attrs], ... ] in newer lucide; or { ... } older
  const nodes = Array.isArray(icon) ? icon : (icon[2] || []);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
    >
      {nodes.map((n, i) => {
        const [tag, attrs] = n;
        return React.createElement(tag, { key: i, ...attrs });
      })}
    </svg>
  );
}

function toPascal(s) {
  return s.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('');
}

window.Icon = Icon;
