export function WebGLFallback() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      background: '#050510',
      color: '#8b8fad',
      fontFamily: 'system-ui, sans-serif',
      textAlign: 'center',
      padding: '20px',
    }}>
      <div style={{ fontSize: '20px', fontWeight: 700, color: '#e0e0e0', marginBottom: '8px' }}>
        Safran PNT
      </div>
      <p>3D globe requires WebGL support.</p>
      <p style={{ fontSize: '13px', marginTop: '8px' }}>
        Please use a modern browser with WebGL enabled.
      </p>
    </div>
  );
}
