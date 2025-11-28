import { useMemo } from 'react';
import { Box, Sphere, Cylinder, Cone } from '@react-three/drei';
import * as THREE from 'three';

// Базовый материал
const createMaterial = (color, emissive, emissiveIntensity) => (
  <meshStandardMaterial
    color={color}
    emissive={emissive}
    emissiveIntensity={emissiveIntensity}
    metalness={0.5}
    roughness={0.3}
  />
);

// Автомобиль
export function Car({ size = [1, 1, 1], color = '#ff0000', emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  const material = useMemo(() => createMaterial(color, emissive, emissiveIntensity), [color, emissive, emissiveIntensity]);

  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Кузов */}
      <Box args={[scale * 0.8, scale * 0.4, scale * 0.5]} position={[0, scale * 0.1, 0]}>
        {material}
      </Box>
      {/* Кабина */}
      <Box args={[scale * 0.6, scale * 0.35, scale * 0.45]} position={[0, scale * 0.35, 0]}>
        {material}
      </Box>
      {/* Колеса */}
      <Cylinder args={[scale * 0.15, scale * 0.15, scale * 0.1, 16]} position={[-scale * 0.35, 0, scale * 0.3]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
      <Cylinder args={[scale * 0.15, scale * 0.15, scale * 0.1, 16]} position={[scale * 0.35, 0, scale * 0.3]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
      <Cylinder args={[scale * 0.15, scale * 0.15, scale * 0.1, 16]} position={[-scale * 0.35, 0, -scale * 0.3]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
      <Cylinder args={[scale * 0.15, scale * 0.15, scale * 0.1, 16]} position={[scale * 0.35, 0, -scale * 0.3]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
    </group>
  );
}

// Корабль
export function Ship({ size = [1, 1, 1], color = '#4169e1', emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  const material = useMemo(() => createMaterial(color, emissive, emissiveIntensity), [color, emissive, emissiveIntensity]);

  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Корпус */}
      <Box args={[scale * 1.2, scale * 0.3, scale * 0.4]} position={[0, 0, 0]}>
        {material}
      </Box>
      {/* Нос */}
      <Box args={[scale * 0.3, scale * 0.25, scale * 0.35]} position={[-scale * 0.45, scale * 0.05, 0]}>
        {material}
      </Box>
      {/* Надстройка */}
      <Box args={[scale * 0.4, scale * 0.5, scale * 0.35]} position={[scale * 0.3, scale * 0.25, 0]}>
        {material}
      </Box>
      {/* Дымовая труба */}
      <Cylinder args={[scale * 0.08, scale * 0.08, scale * 0.4, 8]} position={[scale * 0.2, scale * 0.5, 0]}>
        {material}
      </Cylinder>
    </group>
  );
}

// Самолет
export function Airplane({ size = [1, 1, 1], color = '#ffffff', emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  const material = useMemo(() => createMaterial(color, emissive, emissiveIntensity), [color, emissive, emissiveIntensity]);

  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Фюзеляж */}
      <Cylinder args={[scale * 0.08, scale * 0.12, scale * 1.0, 16]} position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        {material}
      </Cylinder>
      {/* Крылья */}
      <Box args={[scale * 0.02, scale * 0.3, scale * 1.0]} position={[0, 0, 0]}>
        {material}
      </Box>
      {/* Хвост */}
      <Box args={[scale * 0.15, scale * 0.25, scale * 0.08]} position={[scale * 0.45, scale * 0.1, 0]}>
        {material}
      </Box>
      {/* Нос */}
      <Cone args={[scale * 0.12, scale * 0.3, 8]} position={[-scale * 0.5, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        {material}
      </Cone>
    </group>
  );
}

// Поезд
export function Train({ size = [1, 1, 1], color = '#0000ff', emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  const material = useMemo(() => createMaterial(color, emissive, emissiveIntensity), [color, emissive, emissiveIntensity]);

  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Вагон */}
      <Box args={[scale * 0.6, scale * 0.5, scale * 0.4]} position={[0, scale * 0.15, 0]}>
        {material}
      </Box>
      {/* Колеса */}
      <Cylinder args={[scale * 0.2, scale * 0.2, scale * 0.08, 16]} position={[-scale * 0.2, 0, scale * 0.25]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
      <Cylinder args={[scale * 0.2, scale * 0.2, scale * 0.08, 16]} position={[scale * 0.2, 0, scale * 0.25]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
      <Cylinder args={[scale * 0.2, scale * 0.2, scale * 0.08, 16]} position={[-scale * 0.2, 0, -scale * 0.25]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
      <Cylinder args={[scale * 0.2, scale * 0.2, scale * 0.08, 16]} position={[scale * 0.2, 0, -scale * 0.25]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
    </group>
  );
}

// Вертолет
export function Helicopter({ size = [1, 1, 1], color = '#228b22', emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  const material = useMemo(() => createMaterial(color, emissive, emissiveIntensity), [color, emissive, emissiveIntensity]);

  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Корпус */}
      <Box args={[scale * 0.6, scale * 0.3, scale * 0.5]} position={[0, scale * 0.05, 0]}>
        {material}
      </Box>
      {/* Кабина */}
      <Box args={[scale * 0.4, scale * 0.3, scale * 0.4]} position={[-scale * 0.15, scale * 0.2, 0]}>
        {material}
      </Box>
      {/* Основной ротор */}
      <Cylinder args={[scale * 0.01, scale * 0.01, scale * 0.7, 8]} position={[0, scale * 0.55, 0]}>
        {material}
      </Cylinder>
      <Box args={[scale * 0.05, scale * 0.8, scale * 0.02]} position={[0, scale * 0.55, 0]}>
        {material}
      </Box>
      {/* Хвостовой ротор */}
      <Box args={[scale * 0.3, scale * 0.02, scale * 0.02]} position={[scale * 0.4, scale * 0.25, 0]}>
        {material}
      </Box>
      <Box args={[scale * 0.02, scale * 0.3, scale * 0.02]} position={[scale * 0.4, scale * 0.25, 0]}>
        {material}
      </Box>
    </group>
  );
}

// Автобус
export function Bus({ size = [1, 1, 1], color = '#ffa500', emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  const material = useMemo(() => createMaterial(color, emissive, emissiveIntensity), [color, emissive, emissiveIntensity]);

  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Кузов */}
      <Box args={[scale * 1.0, scale * 0.5, scale * 0.5]} position={[0, scale * 0.15, 0]}>
        {material}
      </Box>
      {/* Окна */}
      <Box args={[scale * 0.85, scale * 0.3, scale * 0.01]} position={[0, scale * 0.25, scale * 0.26]}>
        <meshStandardMaterial color="#87ceeb" transparent opacity={0.5} />
      </Box>
      {/* Колеса */}
      <Cylinder args={[scale * 0.18, scale * 0.18, scale * 0.12, 16]} position={[-scale * 0.35, 0, scale * 0.3]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
      <Cylinder args={[scale * 0.18, scale * 0.18, scale * 0.12, 16]} position={[scale * 0.35, 0, scale * 0.3]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
      <Cylinder args={[scale * 0.18, scale * 0.18, scale * 0.12, 16]} position={[-scale * 0.35, 0, -scale * 0.3]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
      <Cylinder args={[scale * 0.18, scale * 0.18, scale * 0.12, 16]} position={[scale * 0.35, 0, -scale * 0.3]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
    </group>
  );
}

// Грузовик
export function Truck({ size = [1, 1, 1], color = '#8b4513', emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  const material = useMemo(() => createMaterial(color, emissive, emissiveIntensity), [color, emissive, emissiveIntensity]);

  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Кабина */}
      <Box args={[scale * 0.4, scale * 0.4, scale * 0.4]} position={[-scale * 0.2, scale * 0.15, 0]}>
        {material}
      </Box>
      {/* Кузов */}
      <Box args={[scale * 0.7, scale * 0.35, scale * 0.5]} position={[scale * 0.25, scale * 0.1, 0]}>
        {material}
      </Box>
      {/* Колеса */}
      <Cylinder args={[scale * 0.2, scale * 0.2, scale * 0.1, 16]} position={[-scale * 0.15, 0, scale * 0.25]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
      <Cylinder args={[scale * 0.2, scale * 0.2, scale * 0.1, 16]} position={[scale * 0.15, 0, scale * 0.25]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
      <Cylinder args={[scale * 0.2, scale * 0.2, scale * 0.1, 16]} position={[scale * 0.45, 0, scale * 0.25]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
      <Cylinder args={[scale * 0.2, scale * 0.2, scale * 0.1, 16]} position={[-scale * 0.15, 0, -scale * 0.25]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
      <Cylinder args={[scale * 0.2, scale * 0.2, scale * 0.1, 16]} position={[scale * 0.15, 0, -scale * 0.25]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
      <Cylinder args={[scale * 0.2, scale * 0.2, scale * 0.1, 16]} position={[scale * 0.45, 0, -scale * 0.25]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
    </group>
  );
}

// Мотоцикл
export function Motorcycle({ size = [1, 1, 1], color = '#000000', emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  const material = useMemo(() => createMaterial(color, emissive, emissiveIntensity), [color, emissive, emissiveIntensity]);

  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Рама */}
      <Box args={[scale * 0.5, scale * 0.05, scale * 0.08]} position={[0, scale * 0.15, 0]}>
        {material}
      </Box>
      {/* Колеса */}
      <Cylinder args={[scale * 0.25, scale * 0.25, scale * 0.05, 16]} position={[-scale * 0.25, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
      <Cylinder args={[scale * 0.25, scale * 0.25, scale * 0.05, 16]} position={[scale * 0.25, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
      {/* Сиденье */}
      <Box args={[scale * 0.2, scale * 0.08, scale * 0.1]} position={[0, scale * 0.18, 0]}>
        {material}
      </Box>
      {/* Руль */}
      <Box args={[scale * 0.35, scale * 0.03, scale * 0.03]} position={[-scale * 0.15, scale * 0.3, 0]} rotation={[0, 0, Math.PI / 6]}>
        {material}
      </Box>
    </group>
  );
}

// Велосипед
export function Bicycle({ size = [1, 1, 1], color = '#00ff00', emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  const material = useMemo(() => createMaterial(color, emissive, emissiveIntensity), [color, emissive, emissiveIntensity]);

  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Рама */}
      <Box args={[scale * 0.4, scale * 0.03, scale * 0.03]} position={[0, scale * 0.15, 0]} rotation={[0, 0, Math.PI / 12]}>
        {material}
      </Box>
      {/* Колеса */}
      <Cylinder args={[scale * 0.2, scale * 0.2, scale * 0.02, 16]} position={[-scale * 0.2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
      <Cylinder args={[scale * 0.2, scale * 0.2, scale * 0.02, 16]} position={[scale * 0.2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
      {/* Спицы */}
      <Cylinder args={[scale * 0.01, scale * 0.01, scale * 0.4, 8]} position={[-scale * 0.2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        {material}
      </Cylinder>
      <Cylinder args={[scale * 0.01, scale * 0.01, scale * 0.4, 8]} position={[scale * 0.2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        {material}
      </Cylinder>
      {/* Руль */}
      <Box args={[scale * 0.25, scale * 0.02, scale * 0.02]} position={[-scale * 0.15, scale * 0.25, 0]}>
        {material}
      </Box>
      {/* Сиденье */}
      <Box args={[scale * 0.1, scale * 0.05, scale * 0.08]} position={[0, scale * 0.2, 0]}>
        {material}
      </Box>
    </group>
  );
}

// Погрузчик
export function Forklift({ size = [1, 1, 1], color = '#ffff00', emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  const material = useMemo(() => createMaterial(color, emissive, emissiveIntensity), [color, emissive, emissiveIntensity]);

  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Основание */}
      <Box args={[scale * 0.5, scale * 0.2, scale * 0.4]} position={[0, scale * 0.05, 0]}>
        {material}
      </Box>
      {/* Кабина */}
      <Box args={[scale * 0.3, scale * 0.35, scale * 0.3]} position={[-scale * 0.1, scale * 0.275, 0]}>
        {material}
      </Box>
      {/* Вилы */}
      <Box args={[scale * 0.05, scale * 0.6, scale * 0.02]} position={[scale * 0.35, scale * 0.15, -scale * 0.1]}>
        {material}
      </Box>
      <Box args={[scale * 0.05, scale * 0.6, scale * 0.02]} position={[scale * 0.35, scale * 0.15, scale * 0.1]}>
        {material}
      </Box>
      {/* Колеса */}
      <Cylinder args={[scale * 0.15, scale * 0.15, scale * 0.1, 16]} position={[-scale * 0.15, 0, scale * 0.2]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
      <Cylinder args={[scale * 0.15, scale * 0.15, scale * 0.1, 16]} position={[scale * 0.15, 0, scale * 0.2]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
      <Cylinder args={[scale * 0.15, scale * 0.15, scale * 0.1, 16]} position={[-scale * 0.15, 0, -scale * 0.2]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
      <Cylinder args={[scale * 0.15, scale * 0.15, scale * 0.1, 16]} position={[scale * 0.15, 0, -scale * 0.2]} rotation={[0, 0, Math.PI / 2]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
    </group>
  );
}

