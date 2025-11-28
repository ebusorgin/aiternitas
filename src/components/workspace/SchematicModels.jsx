import { useMemo } from 'react';
import { Box, Sphere, Cylinder } from '@react-three/drei';
import * as THREE from 'three';

// Схематическая модель человека
export function SchematicHuman({ size = [1, 1, 1], color, emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  
  const material = useMemo(() => (
    <meshStandardMaterial
      color={color}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      metalness={0.3}
      roughness={0.7}
    />
  ), [color, emissive, emissiveIntensity]);

  return (
    <group
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      userData={userData}
    >
      {/* Голова */}
      <Sphere args={[scale * 0.15, 16, 16]} position={[0, scale * 0.35, 0]}>
        {material}
      </Sphere>
      {/* Тело */}
      <Box args={[scale * 0.2, scale * 0.4, scale * 0.15]} position={[0, scale * 0.05, 0]}>
        {material}
      </Box>
      {/* Левая рука */}
      <Box args={[scale * 0.08, scale * 0.3, scale * 0.08]} position={[-scale * 0.2, scale * 0.1, 0]}>
        {material}
      </Box>
      {/* Правая рука */}
      <Box args={[scale * 0.08, scale * 0.3, scale * 0.08]} position={[scale * 0.2, scale * 0.1, 0]}>
        {material}
      </Box>
      {/* Левая нога */}
      <Box args={[scale * 0.1, scale * 0.35, scale * 0.1]} position={[-scale * 0.08, -scale * 0.25, 0]}>
        {material}
      </Box>
      {/* Правая нога */}
      <Box args={[scale * 0.1, scale * 0.35, scale * 0.1]} position={[scale * 0.08, -scale * 0.25, 0]}>
        {material}
      </Box>
    </group>
  );
}

// Схематическая модель компьютера
export function SchematicComputer({ size = [1, 1, 1], color, emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  
  const material = useMemo(() => (
    <meshStandardMaterial
      color={color}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      metalness={0.5}
      roughness={0.3}
    />
  ), [color, emissive, emissiveIntensity]);

  return (
    <group
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      userData={userData}
    >
      {/* Монитор */}
      <Box args={[scale * 0.6, scale * 0.5, scale * 0.05]} position={[0, scale * 0.15, 0]}>
        {material}
      </Box>
      {/* Подставка монитора */}
      <Box args={[scale * 0.2, scale * 0.1, scale * 0.1]} position={[0, scale * 0.05, 0]}>
        {material}
      </Box>
      {/* Клавиатура */}
      <Box args={[scale * 0.5, scale * 0.05, scale * 0.2]} position={[0, -scale * 0.15, scale * 0.1]}>
        {material}
      </Box>
    </group>
  );
}

// Схематическая модель автомобиля
export function SchematicCar({ size = [1, 1, 1], color, emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  
  const material = useMemo(() => (
    <meshStandardMaterial
      color={color}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      metalness={0.7}
      roughness={0.2}
    />
  ), [color, emissive, emissiveIntensity]);

  return (
    <group
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      userData={userData}
    >
      {/* Кузов */}
      <Box args={[scale * 0.8, scale * 0.3, scale * 0.4]} position={[0, scale * 0.05, 0]}>
        {material}
      </Box>
      {/* Кабина */}
      <Box args={[scale * 0.4, scale * 0.35, scale * 0.35]} position={[scale * 0.15, scale * 0.25, 0]}>
        {material}
      </Box>
      {/* Колеса */}
      <Cylinder args={[scale * 0.12, scale * 0.12, scale * 0.1, 16]} rotation={[0, 0, Math.PI / 2]} position={[-scale * 0.25, -scale * 0.05, scale * 0.25]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
      <Cylinder args={[scale * 0.12, scale * 0.12, scale * 0.1, 16]} rotation={[0, 0, Math.PI / 2]} position={[scale * 0.25, -scale * 0.05, scale * 0.25]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
      <Cylinder args={[scale * 0.12, scale * 0.12, scale * 0.1, 16]} rotation={[0, 0, Math.PI / 2]} position={[-scale * 0.25, -scale * 0.05, -scale * 0.25]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
      <Cylinder args={[scale * 0.12, scale * 0.12, scale * 0.1, 16]} rotation={[0, 0, Math.PI / 2]} position={[scale * 0.25, -scale * 0.05, -scale * 0.25]}>
        <meshStandardMaterial color="#1a1a1a" />
      </Cylinder>
    </group>
  );
}

// Человек с бумагами
export function SchematicHumanWithPapers({ size = [1, 1, 1], color, emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  
  const material = useMemo(() => (
    <meshStandardMaterial
      color={color}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      metalness={0.3}
      roughness={0.7}
    />
  ), [color, emissive, emissiveIntensity]);

  const paperMaterial = useMemo(() => (
    <meshStandardMaterial
      color="#ffffff"
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      metalness={0.1}
      roughness={0.9}
    />
  ), [emissive, emissiveIntensity]);

  return (
    <group
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      userData={userData}
    >
      {/* Голова */}
      <Sphere args={[scale * 0.15, 16, 16]} position={[0, scale * 0.35, 0]}>
        {material}
      </Sphere>
      {/* Тело */}
      <Box args={[scale * 0.2, scale * 0.4, scale * 0.15]} position={[0, scale * 0.05, 0]}>
        {material}
      </Box>
      {/* Левая рука */}
      <Box args={[scale * 0.08, scale * 0.3, scale * 0.08]} position={[-scale * 0.2, scale * 0.1, 0]}>
        {material}
      </Box>
      {/* Правая рука (держит бумаги) */}
      <Box args={[scale * 0.08, scale * 0.3, scale * 0.08]} position={[scale * 0.2, scale * 0.1, 0]}>
        {material}
      </Box>
      {/* Бумаги в руке */}
      <Box args={[scale * 0.15, scale * 0.2, scale * 0.02]} position={[scale * 0.35, scale * 0.15, 0]} rotation={[0, 0, Math.PI / 6]}>
        {paperMaterial}
      </Box>
      {/* Левая нога */}
      <Box args={[scale * 0.1, scale * 0.35, scale * 0.1]} position={[-scale * 0.08, -scale * 0.25, 0]}>
        {material}
      </Box>
      {/* Правая нога */}
      <Box args={[scale * 0.1, scale * 0.35, scale * 0.1]} position={[scale * 0.08, -scale * 0.25, 0]}>
        {material}
      </Box>
    </group>
  );
}

// Человек за компьютером
export function SchematicHumanAtComputer({ size = [1, 1, 1], color, emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  
  const material = useMemo(() => (
    <meshStandardMaterial
      color={color}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      metalness={0.3}
      roughness={0.7}
    />
  ), [color, emissive, emissiveIntensity]);

  const computerMaterial = useMemo(() => (
    <meshStandardMaterial
      color={color}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      metalness={0.5}
      roughness={0.3}
    />
  ), [color, emissive, emissiveIntensity]);

  return (
    <group
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      userData={userData}
    >
      {/* Человек */}
      {/* Голова */}
      <Sphere args={[scale * 0.15, 16, 16]} position={[-scale * 0.15, scale * 0.35, 0]}>
        {material}
      </Sphere>
      {/* Тело */}
      <Box args={[scale * 0.2, scale * 0.4, scale * 0.15]} position={[-scale * 0.15, scale * 0.05, 0]}>
        {material}
      </Box>
      {/* Левая рука */}
      <Box args={[scale * 0.08, scale * 0.25, scale * 0.08]} position={[-scale * 0.3, scale * 0.08, 0]}>
        {material}
      </Box>
      {/* Правая рука (на клавиатуре) */}
      <Box args={[scale * 0.08, scale * 0.25, scale * 0.08]} position={[scale * 0.05, scale * 0.08, scale * 0.15]} rotation={[0, -Math.PI / 4, 0]}>
        {material}
      </Box>
      {/* Левая нога */}
      <Box args={[scale * 0.1, scale * 0.35, scale * 0.1]} position={[-scale * 0.2, -scale * 0.25, 0]}>
        {material}
      </Box>
      {/* Правая нога */}
      <Box args={[scale * 0.1, scale * 0.35, scale * 0.1]} position={[-scale * 0.1, -scale * 0.25, 0]}>
        {material}
      </Box>
      
      {/* Компьютер */}
      {/* Монитор */}
      <Box args={[scale * 0.5, scale * 0.4, scale * 0.05]} position={[scale * 0.2, scale * 0.2, 0]}>
        {computerMaterial}
      </Box>
      {/* Подставка монитора */}
      <Box args={[scale * 0.15, scale * 0.08, scale * 0.08]} position={[scale * 0.2, scale * 0.05, 0]}>
        {computerMaterial}
      </Box>
      {/* Клавиатура */}
      <Box args={[scale * 0.4, scale * 0.04, scale * 0.15]} position={[scale * 0.15, -scale * 0.1, scale * 0.1]}>
        {computerMaterial}
      </Box>
    </group>
  );
}

