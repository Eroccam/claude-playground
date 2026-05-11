export function OceanSphere() {
  return (
    <mesh>
      <sphereGeometry args={[1, 64, 64]} />
      <meshBasicMaterial color="#0d1b3e" />
    </mesh>
  );
}
