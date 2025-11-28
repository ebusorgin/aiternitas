import { useMemo } from 'react';
import { Box, Sphere, Cylinder, Cone } from '@react-three/drei';
import * as THREE from 'three';

// Базовый материал
const createMaterial = (color, emissive, emissiveIntensity) => (
  <meshStandardMaterial
    color={color}
    emissive={emissive}
    emissiveIntensity={emissiveIntensity}
    metalness={0.2}
    roughness={0.6}
  />
);

// Консультация
export function Consultation({ size = [1, 1, 1], color = '#9370db', emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  const material = useMemo(() => createMaterial(color, emissive, emissiveIntensity), [color, emissive, emissiveIntensity]);

  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Основание - стол/стол переговоров */}
      <Cylinder args={[scale * 0.4, scale * 0.4, scale * 0.05, 16]} position={[0, scale * 0.025, 0]}>
        {material}
      </Cylinder>
      {/* Речевой пузырь */}
      <Sphere args={[scale * 0.2, 16, 16]} position={[0, scale * 0.4, 0]}>
        <meshStandardMaterial color="#ffffff" transparent opacity={0.8} />
      </Sphere>
      {/* Линии речи */}
      <Box args={[scale * 0.02, scale * 0.15, scale * 0.02]} position={[0, scale * 0.25, 0]}>
        {material}
      </Box>
    </group>
  );
}

// Ремонт
export function Repair({ size = [1, 1, 1], color = '#ff8c00', emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  const material = useMemo(() => createMaterial(color, emissive, emissiveIntensity), [color, emissive, emissiveIntensity]);

  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Коробка с инструментами */}
      <Box args={[scale * 0.4, scale * 0.3, scale * 0.3]} position={[0, scale * 0.15, 0]}>
        {material}
      </Box>
      {/* Гаечный ключ */}
      <Box args={[scale * 0.3, scale * 0.05, scale * 0.05]} position={[-scale * 0.1, scale * 0.35, 0]} rotation={[0, 0, Math.PI / 4]}>
        {material}
      </Box>
      {/* Молоток */}
      <Box args={[scale * 0.15, scale * 0.08, scale * 0.08]} position={[scale * 0.2, scale * 0.35, 0]}>
        {material}
      </Box>
      <Box args={[scale * 0.2, scale * 0.03, scale * 0.03]} position={[scale * 0.25, scale * 0.35, 0]}>
        {material}
      </Box>
    </group>
  );
}

// Доставка
export function Delivery({ size = [1, 1, 1], color = '#4169e1', emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  const material = useMemo(() => createMaterial(color, emissive, emissiveIntensity), [color, emissive, emissiveIntensity]);

  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Посылка */}
      <Box args={[scale * 0.4, scale * 0.4, scale * 0.4]} position={[0, scale * 0.2, 0]}>
        {material}
      </Box>
      {/* Лента */}
      <Box args={[scale * 0.45, scale * 0.05, scale * 0.05]} position={[0, scale * 0.2, 0]}>
        <meshStandardMaterial color="#ff0000" />
      </Box>
      {/* Стрелка */}
      <Cone args={[scale * 0.15, scale * 0.2, 3]} position={[0, scale * 0.5, 0]}>
        <meshStandardMaterial color="#00ff00" />
      </Cone>
    </group>
  );
}

// Уборка
export function Cleaning({ size = [1, 1, 1], color = '#00ced1', emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  const material = useMemo(() => createMaterial(color, emissive, emissiveIntensity), [color, emissive, emissiveIntensity]);

  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Ведро */}
      <Cylinder args={[scale * 0.25, scale * 0.25, scale * 0.3, 16]} position={[0, scale * 0.15, 0]}>
        {material}
      </Cylinder>
      {/* Ручка ведра */}
      <Box args={[scale * 0.3, scale * 0.03, scale * 0.03]} position={[0, scale * 0.35, 0]} rotation={[0, 0, Math.PI / 6]}>
        {material}
      </Box>
      {/* Швабра */}
      <Box args={[scale * 0.03, scale * 0.4, scale * 0.03]} position={[scale * 0.2, scale * 0.3, 0]}>
        {material}
      </Box>
      <Box args={[scale * 0.15, scale * 0.05, scale * 0.02]} position={[scale * 0.2, scale * 0.1, 0]}>
        {material}
      </Box>
    </group>
  );
}

// Служба охраны
export function SecurityService({ size = [1, 1, 1], color = '#2f4f4f', emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  const material = useMemo(() => createMaterial(color, emissive, emissiveIntensity), [color, emissive, emissiveIntensity]);

  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Щит */}
      <Cylinder args={[scale * 0.3, scale * 0.3, scale * 0.05, 16]} position={[0, scale * 0.2, 0]}>
        {material}
      </Cylinder>
      {/* Замок */}
      <Box args={[scale * 0.15, scale * 0.15, scale * 0.1]} position={[0, scale * 0.4, 0]}>
        {material}
      </Box>
      {/* Ключ */}
      <Box args={[scale * 0.2, scale * 0.03, scale * 0.02]} position={[-scale * 0.15, scale * 0.4, 0]} rotation={[0, 0, Math.PI / 6]}>
        {material}
      </Box>
    </group>
  );
}

// Обучение
export function Training({ size = [1, 1, 1], color = '#4682b4', emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  const material = useMemo(() => createMaterial(color, emissive, emissiveIntensity), [color, emissive, emissiveIntensity]);

  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Книга */}
      <Box args={[scale * 0.3, scale * 0.4, scale * 0.15]} position={[0, scale * 0.2, 0]}>
        {material}
      </Box>
      {/* Открытая страница */}
      <Box args={[scale * 0.01, scale * 0.35, scale * 0.14]} position={[0, scale * 0.2, scale * 0.08]}>
        <meshStandardMaterial color="#ffffff" />
      </Box>
      {/* Градусник знаний */}
      <Box args={[scale * 0.05, scale * 0.3, scale * 0.05]} position={[scale * 0.25, scale * 0.15, 0]}>
        {material}
      </Box>
      <Box args={[scale * 0.03, scale * 0.25, scale * 0.03]} position={[scale * 0.25, scale * 0.25, 0]}>
        <meshStandardMaterial color="#00ff00" />
      </Box>
    </group>
  );
}

// Медицинская услуга
export function MedicalService({ size = [1, 1, 1], color = '#dc143c', emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  const material = useMemo(() => createMaterial(color, emissive, emissiveIntensity), [color, emissive, emissiveIntensity]);

  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Крест медицины */}
      <Box args={[scale * 0.4, scale * 0.08, scale * 0.05]} position={[0, scale * 0.2, 0]}>
        <meshStandardMaterial color="#ffffff" />
      </Box>
      <Box args={[scale * 0.08, scale * 0.4, scale * 0.05]} position={[0, scale * 0.2, 0]}>
        <meshStandardMaterial color="#ffffff" />
      </Box>
      {/* Таблетка */}
      <Sphere args={[scale * 0.15, 16, 16]} position={[-scale * 0.3, scale * 0.2, 0]}>
        {material}
      </Sphere>
      {/* Шприц */}
      <Cylinder args={[scale * 0.05, scale * 0.05, scale * 0.2, 16]} position={[scale * 0.3, scale * 0.2, 0]}>
        {material}
      </Cylinder>
    </group>
  );
}

// Кейтеринг
export function Catering({ size = [1, 1, 1], color = '#ff6347', emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  const material = useMemo(() => createMaterial(color, emissive, emissiveIntensity), [color, emissive, emissiveIntensity]);

  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Стол */}
      <Cylinder args={[scale * 0.4, scale * 0.4, scale * 0.05, 16]} position={[0, scale * 0.025, 0]}>
        {material}
      </Cylinder>
      {/* Тарелка */}
      <Cylinder args={[scale * 0.2, scale * 0.25, scale * 0.05, 16]} position={[-scale * 0.2, scale * 0.1, 0]}>
        <meshStandardMaterial color="#ffffff" />
      </Cylinder>
      {/* Вилка */}
      <Box args={[scale * 0.15, scale * 0.03, scale * 0.02]} position={[0, scale * 0.15, 0]}>
        {material}
      </Box>
      {/* Нож */}
      <Box args={[scale * 0.15, scale * 0.02, scale * 0.02]} position={[scale * 0.2, scale * 0.15, 0]} rotation={[0, 0, Math.PI / 8]}>
        {material}
      </Box>
    </group>
  );
}

// Транспорт
export function Transport({ size = [1, 1, 1], color = '#32cd32', emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  const material = useMemo(() => createMaterial(color, emissive, emissiveIntensity), [color, emissive, emissiveIntensity]);

  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Дорога */}
      <Box args={[scale * 0.6, scale * 0.05, scale * 0.3]} position={[0, 0, 0]}>
        <meshStandardMaterial color="#4a4a4a" />
      </Box>
      {/* Разметка */}
      <Box args={[scale * 0.05, scale * 0.02, scale * 0.25]} position={[0, scale * 0.03, 0]}>
        <meshStandardMaterial color="#ffff00" />
      </Box>
      {/* Стрелки направления */}
      <Box args={[scale * 0.15, scale * 0.02, scale * 0.02]} position={[-scale * 0.2, scale * 0.1, 0]} rotation={[0, 0, Math.PI / 4]}>
        {material}
      </Box>
      <Box args={[scale * 0.15, scale * 0.02, scale * 0.02]} position={[scale * 0.2, scale * 0.1, 0]} rotation={[0, 0, -Math.PI / 4]}>
        {material}
      </Box>
    </group>
  );
}

// Развлечения
export function Entertainment({ size = [1, 1, 1], color = '#ff1493', emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  const material = useMemo(() => createMaterial(color, emissive, emissiveIntensity), [color, emissive, emissiveIntensity]);

  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Сцена */}
      <Box args={[scale * 0.6, scale * 0.1, scale * 0.4]} position={[0, scale * 0.05, 0]}>
        {material}
      </Box>
      {/* Микрофон */}
      <Cylinder args={[scale * 0.04, scale * 0.04, scale * 0.2, 16]} position={[-scale * 0.15, scale * 0.25, 0]}>
        {material}
      </Cylinder>
      <Sphere args={[scale * 0.06, 16, 16]} position={[-scale * 0.15, scale * 0.36, 0]}>
        {material}
      </Sphere>
      {/* Музыкальные ноты */}
      <Sphere args={[scale * 0.08, 16, 16]} position={[scale * 0.2, scale * 0.3, 0]}>
        <meshStandardMaterial color="#ffffff" />
      </Sphere>
      <Box args={[scale * 0.05, scale * 0.2, scale * 0.02]} position={[scale * 0.25, scale * 0.25, 0]}>
        <meshStandardMaterial color="#ffffff" />
      </Box>
    </group>
  );
}

