import { useRef, useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useFlowchartStore, ELEMENT_TYPES, CONNECTION_TYPES } from '../../store/flowchartStore';
import ElementInfoModal from './ElementInfoModal';
import ContextMenu from './ContextMenu';
import './FlowchartCanvas3D.css';

// 3D positioning constants
const MIN_SPHERE_RADIUS = 1.5;   // Minimum sphere size
const MAX_SPHERE_RADIUS = 3.0;   // Max sphere size
const DEPT_RING_RADIUS = 8;      // Base radius for department circle
const WORKER_RING_RADIUS = 12;   // Radius for workers ring
const PERSON_SCALE = 0.5;
const DEPT_LEVEL = 0;            // Departments Y level
const MANAGER_LEVEL = 5;         // Managers Y level (above departments)
const WORKER_LEVEL = 7;          // Workers Y level (top)

// Person figure (schematic human)
function PersonFigure({ element, position, isManager, opacity = 1, onSelect, onDoubleClick, onContextMenu, isSelected }) {
  const groupRef = useRef();
  const [hovered, setHovered] = useState(false);
  
  // Use consistent colors: managers pink, regular workers green
  const MANAGER_COLOR = '#ec4899';  // Pink
  const WORKER_COLOR = '#22c55e';   // Green (from ELEMENT_TYPES.worker.color)
  const color = isManager ? MANAGER_COLOR : WORKER_COLOR;
  const scale = PERSON_SCALE * (isManager ? 1.2 : 1);
  
  return (
    <group 
      ref={groupRef}
      position={position}
      scale={[scale, scale, scale]}
      userData={{ elementId: element.id }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(element.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick(element);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        hoveredElementRef.current = element;
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={(e) => {
        setHovered(false);
        hoveredElementRef.current = null;
        document.body.style.cursor = 'auto';
      }}
    >
      {/* Head */}
      <mesh position={[0, 1.8, 0]} userData={{ elementId: element.id }}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshStandardMaterial 
          color={hovered || isSelected ? '#ffffff' : color}
          transparent
          opacity={opacity}
          emissive={hovered || isSelected ? color : '#000000'}
          emissiveIntensity={hovered || isSelected ? 0.5 : 0}
        />
      </mesh>
      
      {/* Body */}
      <mesh position={[0, 0.8, 0]} userData={{ elementId: element.id }}>
        <capsuleGeometry args={[0.4, 1.2, 8, 16]} />
        <meshStandardMaterial 
          color={hovered || isSelected ? '#ffffff' : color}
          transparent
          opacity={opacity}
          emissive={hovered || isSelected ? color : '#000000'}
          emissiveIntensity={hovered || isSelected ? 0.5 : 0}
        />
      </mesh>
      
      {/* Left Arm */}
      <mesh position={[-0.7, 0.9, 0]} rotation={[0, 0, Math.PI / 6]} userData={{ elementId: element.id }}>
        <capsuleGeometry args={[0.15, 0.8, 4, 8]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} />
      </mesh>
      
      {/* Right Arm */}
      <mesh position={[0.7, 0.9, 0]} rotation={[0, 0, -Math.PI / 6]} userData={{ elementId: element.id }}>
        <capsuleGeometry args={[0.15, 0.8, 4, 8]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} />
      </mesh>
      
      {/* Left Leg */}
      <mesh position={[-0.25, -0.5, 0]} userData={{ elementId: element.id }}>
        <capsuleGeometry args={[0.15, 0.8, 4, 8]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} />
      </mesh>
      
      {/* Right Leg */}
      <mesh position={[0.25, -0.5, 0]} userData={{ elementId: element.id }}>
        <capsuleGeometry args={[0.15, 0.8, 4, 8]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} />
      </mesh>
      
      {/* Name label */}
      <Html position={[0, 2.5, 0]} center distanceFactor={10} zIndexRange={[0, 0]}>
        <div className={`person-label ${hovered || isSelected ? 'highlighted' : ''}`} style={{ opacity }}>
          <span className="person-icon">{isManager ? '👔' : '👤'}</span>
          <span className="person-name">{element.name}</span>
          {element.properties?.position && (
            <span className="person-position">{element.properties.position}</span>
          )}
        </div>
      </Html>
    </group>
  );
}

// Generic element (services, offerings) as boxes
function GenericElement3D({ element, position, opacity = 1, onSelect, onDoubleClick, onContextMenu, isSelected }) {
  const meshRef = useRef();
  const [hovered, setHovered] = useState(false);
  
  const elementType = ELEMENT_TYPES[element.type];
  // Use standard color from ELEMENT_TYPES for consistency
  const color = elementType?.color || '#f59e0b';
  const icon = elementType?.icon || '📦';
  
  return (
    <group position={position} userData={{ elementId: element.id }}>
      <mesh
        ref={meshRef}
        userData={{ elementId: element.id }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(element.id);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onDoubleClick(element);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          hoveredElementRef.current = element;
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          setHovered(false);
          hoveredElementRef.current = null;
          document.body.style.cursor = 'auto';
        }}
      >
        <boxGeometry args={[1.2, 1.2, 1.2]} />
        <meshStandardMaterial
          color={hovered || isSelected ? '#ffffff' : color}
          transparent
          opacity={opacity * 0.8}
          emissive={hovered || isSelected ? color : '#000000'}
          emissiveIntensity={hovered || isSelected ? 0.5 : 0}
        />
      </mesh>
      
      {/* Label */}
      <Html position={[0, 1.2, 0]} center distanceFactor={10} zIndexRange={[0, 0]}>
        <div className={`element-label ${hovered || isSelected ? 'highlighted' : ''}`} style={{ opacity }}>
          <span className="element-icon">{icon}</span>
          <span className="element-name">{element.name}</span>
        </div>
      </Html>
    </group>
  );
}

// Department sphere (transparent) with visual content indicators
function DepartmentSphere({ element, position, radius, childrenData, opacity = 1, onSelect, onDoubleClick, onContextMenu, isSelected, isFocused }) {
  const meshRef = useRef();
  const groupRef = useRef();
  const [hovered, setHovered] = useState(false);
  
  // Always use standard blue for departments (from ELEMENT_TYPES.department.color)
  const DEPT_COLOR = '#3b82f6';  // Blue
  const color = DEPT_COLOR;
  const childCount = childrenData?.length || 0;
  const hasChildren = childCount > 0;
  
  // Count children by type for visual indicators
  const typeCounts = useMemo(() => {
    if (!childrenData) return { departments: 0, workers: 0, others: 0 };
    return {
      departments: childrenData.filter(c => c.type === 'department').length,
      workers: childrenData.filter(c => c.type === 'worker').length,
      others: childrenData.filter(c => c.type !== 'department' && c.type !== 'worker').length
    };
  }, [childrenData]);
  
  // Generate positions for indicator dots (golden spiral for even distribution)
  const indicatorPositions = useMemo(() => {
    const positions = [];
    const maxIndicators = Math.min(childCount, 12); // Show max 12 indicators
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    
    for (let i = 0; i < maxIndicators; i++) {
      const t = i / maxIndicators;
      const inclination = Math.acos(1 - 2 * t);
      const azimuth = goldenAngle * i;
      
      const indicatorRadius = radius * 0.5; // Position at 50% of sphere radius
      const x = indicatorRadius * Math.sin(inclination) * Math.cos(azimuth);
      const y = indicatorRadius * Math.cos(inclination);
      const z = indicatorRadius * Math.sin(inclination) * Math.sin(azimuth);
      
      // Determine type for coloring - order: departments first (blue), then workers (pink), then others
      let type = 'other';
      if (i < typeCounts.departments) type = 'department';
      else if (i < typeCounts.departments + typeCounts.workers) type = 'worker';
      
      positions.push({ pos: [x, y, z], type });
    }
    return positions;
  }, [childCount, radius, typeCounts]);
  
  return (
    <group ref={groupRef} position={position} userData={{ elementId: element.id }}>
      {/* Main sphere - glass-like appearance, brighter on hover */}
      <mesh
        ref={meshRef}
        userData={{ elementId: element.id }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(element.id);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onDoubleClick(element);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          hoveredElementRef.current = element;
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          setHovered(false);
          hoveredElementRef.current = null;
          document.body.style.cursor = 'auto';
        }}
      >
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial
          color={hovered ? '#60a5fa' : isSelected ? '#fbbf24' : color}
          transparent
          opacity={hovered || isSelected ? 0.45 : 0.25}
          side={THREE.DoubleSide}
          depthWrite={false}
          emissive={hovered || isSelected ? color : '#000000'}
          emissiveIntensity={hovered || isSelected ? 0.2 : 0}
        />
      </mesh>
      
      {/* Content indicator dots inside sphere */}
      {indicatorPositions.map((item, idx) => (
        <mesh key={idx} position={item.pos}>
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshStandardMaterial
            color={item.type === 'worker' ? '#ec4899' : item.type === 'department' ? '#3b82f6' : '#f59e0b'}
            emissive={item.type === 'worker' ? '#ec4899' : item.type === 'department' ? '#3b82f6' : '#f59e0b'}
            emissiveIntensity={0.5}
          />
        </mesh>
      ))}
      
      {/* Center core glow if has children */}
      {hasChildren && (
        <mesh>
          <sphereGeometry args={[radius * 0.15, 16, 16]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.3} />
        </mesh>
      )}
      
      {/* Name label - clean card style */}
      <Html position={[0, radius + 0.8, 0]} center distanceFactor={12} zIndexRange={[0, 0]}>
        <div 
          className={`dept-card ${hovered || isSelected ? 'highlighted' : ''}`} 
          style={{ 
            opacity,
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95))',
            border: `2px solid ${isSelected ? '#fbbf24' : hovered ? '#60a5fa' : color}`,
            borderRadius: '12px',
            padding: '8px 16px',
            minWidth: '120px',
            textAlign: 'center',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff', marginBottom: '4px' }}>
            {element.name}
          </div>
          {hasChildren && (
            <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', justifyContent: 'center', gap: '8px' }}>
              {typeCounts.workers > 0 && <span>👤 {typeCounts.workers}</span>}
              {typeCounts.departments > 0 && <span>🏢 {typeCounts.departments}</span>}
              {typeCounts.others > 0 && <span>📦 {typeCounts.others}</span>}
            </div>
          )}
          {!hasChildren && (
            <div style={{ fontSize: '11px', color: '#64748b' }}>Пусто</div>
          )}
          <div style={{ fontSize: '10px', color: '#475569', marginTop: '4px' }}>
            2×клик → внутрь
          </div>
        </div>
      </Html>
    </group>
  );
}

// 3D Connection line using native Three.js tube - now interactive
function ConnectionLine3D({ connection, fromPos, toPos, opacity = 1, offsetIndex = 0, onSelect, isSelected }) {
  const [hovered, setHovered] = useState(false);
  
  // Safety check for positions
  if (!fromPos || !toPos || !Array.isArray(fromPos) || !Array.isArray(toPos)) {
    return null;
  }
  
  const connType = CONNECTION_TYPES[connection.type] || CONNECTION_TYPES.collaborates;
  const baseColor = connType.color || '#6366f1';
  // Keep original color, just make brighter on hover/select
  const color = hovered ? '#ffffff' : baseColor;
  
  // Calculate perpendicular offset for multiple connections between same elements
  const offsetAmount = offsetIndex * 0.5;
  
  // Calculate direction vector
  const dx = toPos[0] - fromPos[0];
  const dz = toPos[2] - fromPos[2];
  const length = Math.sqrt(dx * dx + dz * dz);
  
  // Perpendicular offset (rotate 90 degrees)
  const perpX = length > 0 ? (-dz / length) * offsetAmount : 0;
  const perpZ = length > 0 ? (dx / length) * offsetAmount : 0;
  
  // Apply offset to positions
  const offsetFromPos = [fromPos[0] + perpX, fromPos[1], fromPos[2] + perpZ];
  const offsetToPos = [toPos[0] + perpX, toPos[1], toPos[2] + perpZ];
  
  // Calculate midpoint for curved line with varying arc height based on connection type
  const arcHeight = connection.type === 'manages' ? 1.5 : (connection.type === 'reports_to' ? 0.8 : 1.0);
  const midPoint = [
    (offsetFromPos[0] + offsetToPos[0]) / 2,
    Math.max(offsetFromPos[1], offsetToPos[1]) + arcHeight,
    (offsetFromPos[2] + offsetToPos[2]) / 2
  ];
  
  // Create tube geometry from curve - thicker when selected
  const tubeGeometry = useMemo(() => {
    const p1 = new THREE.Vector3(...offsetFromPos);
    const p2 = new THREE.Vector3(...midPoint);
    const p3 = new THREE.Vector3(...offsetToPos);
    const curve = new THREE.QuadraticBezierCurve3(p1, p2, p3);
    // Selected = thickest, hovered = medium, default = thin
    const baseRadius = connection.type === 'manages' ? 0.05 : 0.03;
    const radius = isSelected ? 0.12 : (hovered ? 0.08 : baseRadius);
    return new THREE.TubeGeometry(curve, 20, radius, 8, false);
  }, [offsetFromPos[0], offsetFromPos[1], offsetFromPos[2], midPoint[0], midPoint[1], midPoint[2], offsetToPos[0], offsetToPos[1], offsetToPos[2], connection.type, hovered, isSelected]);
  
  // Track hovered connection for context menu
  const handlePointerOver = (e) => {
    e.stopPropagation();
    setHovered(true);
    hoveredElementRef.current = { type: 'connection', connection };
    document.body.style.cursor = 'pointer';
  };
  
  const handlePointerOut = () => {
    setHovered(false);
    if (hoveredElementRef.current?.type === 'connection') {
      hoveredElementRef.current = null;
    }
    document.body.style.cursor = 'auto';
  };
  
  const handleClick = (e) => {
    e.stopPropagation();
    onSelect?.(connection.id);
  };
  
  return (
    <group>
      {/* Connection tube - interactive */}
      <mesh 
        geometry={tubeGeometry}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <meshStandardMaterial 
          color={isSelected ? baseColor : color} 
          emissive={isSelected ? baseColor : (hovered ? baseColor : '#000000')}
          emissiveIntensity={isSelected ? 0.6 : (hovered ? 0.3 : 0)}
        />
      </mesh>
      
      {/* Arrow head for directional connections */}
      {connection.direction !== 'bidirectional' && (
        <mesh 
          position={offsetToPos}
          onClick={handleClick}
          onPointerOver={handlePointerOver}
          onPointerOut={handlePointerOut}
        >
          <coneGeometry args={[isSelected ? 0.2 : 0.15, isSelected ? 0.5 : 0.4, 8]} />
          <meshStandardMaterial 
            color={isSelected ? baseColor : color}
            emissive={isSelected ? baseColor : (hovered ? baseColor : '#000000')}
            emissiveIntensity={isSelected ? 0.6 : (hovered ? 0.3 : 0)}
          />
        </mesh>
      )}
      
      {/* Bidirectional arrows */}
      {connection.direction === 'bidirectional' && (
        <>
          <mesh 
            position={offsetToPos}
            onClick={handleClick}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
          >
            <coneGeometry args={[isSelected ? 0.16 : 0.12, isSelected ? 0.4 : 0.3, 8]} />
            <meshStandardMaterial 
              color={isSelected ? baseColor : color}
              emissive={isSelected ? baseColor : (hovered ? baseColor : '#000000')}
              emissiveIntensity={isSelected ? 0.6 : (hovered ? 0.3 : 0)}
            />
          </mesh>
          <mesh 
            position={offsetFromPos}
            onClick={handleClick}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
          >
            <coneGeometry args={[isSelected ? 0.16 : 0.12, isSelected ? 0.4 : 0.3, 8]} />
            <meshStandardMaterial 
              color={isSelected ? baseColor : color}
              emissive={isSelected ? baseColor : (hovered ? baseColor : '#000000')}
              emissiveIntensity={isSelected ? 0.6 : (hovered ? 0.3 : 0)}
            />
          </mesh>
        </>
      )}
    </group>
  );
}

// Camera animation component - only animates on explicit navigation
function CameraController({ targetPosition, targetZoom, navigationTrigger }) {
  const { camera } = useThree();
  const targetRef = useRef(null);
  const isAnimatingRef = useRef(false);
  const prevNavigationTriggerRef = useRef(navigationTrigger); // Initialize with current value
  const isInitializedRef = useRef(false);
  
  useEffect(() => {
    // Skip first render - don't animate on mount
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      prevNavigationTriggerRef.current = navigationTrigger;
      return;
    }
    
    // Only animate when navigationTrigger actually changes (user navigated to a new view)
    const navigationChanged = prevNavigationTriggerRef.current !== navigationTrigger;
    
    if (navigationChanged && targetPosition) {
      // Only animate when explicitly navigating (navigationTrigger changed)
      isAnimatingRef.current = true;
      const target = new THREE.Vector3(...targetPosition);
      target.add(new THREE.Vector3(8, 10, 8)); // Offset for viewing
      targetRef.current = target;
      prevNavigationTriggerRef.current = navigationTrigger;
    }
    // Don't reset animation state on other dependency changes - let camera stay where it is
  }, [targetPosition, targetZoom, navigationTrigger]);
  
  useFrame(() => {
    // Only animate when explicitly navigating and animation is active
    if (isAnimatingRef.current && targetRef.current) {
      const distance = camera.position.distanceTo(targetRef.current);
      if (distance > 0.1) {
        camera.position.lerp(targetRef.current, 0.05);
      } else {
        // Animation complete
        isAnimatingRef.current = false;
        targetRef.current = null;
      }
    }
  });
  
  return null;
}

// Scene content
// Global ref to track hovered element for context menu
let hoveredElementRef = { current: null };

function SceneContent({ focusedDeptId, onContextMenu, onElementContextMenu, onShowInfo }) {
  const { camera, gl } = useThree();
  const controlsRef = useRef();
  
  const elements = useFlowchartStore((state) => state.elements);
  const connections = useFlowchartStore((state) => state.connections);
  const currentViewId = useFlowchartStore((state) => state.currentViewId);
  const selectedElementId = useFlowchartStore((state) => state.selectedElementId);
  const selectedConnectionId = useFlowchartStore((state) => state.selectedConnectionId);
  const isConnecting = useFlowchartStore((state) => state.isConnecting);
  const connectingFrom = useFlowchartStore((state) => state.connectingFrom);
  const selectElement = useFlowchartStore((state) => state.selectElement);
  const selectConnection = useFlowchartStore((state) => state.selectConnection);
  const finishConnecting = useFlowchartStore((state) => state.finishConnecting);
  const navigateInto = useFlowchartStore((state) => state.navigateInto);
  const updateElement = useFlowchartStore((state) => state.updateElement);
  const updateElement3DPosition = useFlowchartStore((state) => state.updateElement3DPosition);
  
  // Clear hovered element when navigation changes (prevents stale context menus)
  useEffect(() => {
    hoveredElementRef.current = null;
    document.body.style.cursor = 'auto';
  }, [currentViewId]);
  
  // Recursive function to get all descendants
  const getAllDescendants = useCallback((parentId, allElements) => {
    const directChildren = allElements.filter(e => e.parentId === parentId);
    const descendants = [...directChildren];
    directChildren.forEach(child => {
      descendants.push(...getAllDescendants(child.id, allElements));
    });
    return descendants;
  }, []);
  
  // Get visible elements - show ONLY elements at current level (like 2D view)
  const visibleElements = useMemo(() => {
    if (currentViewId === null) {
      // Root view - show only root elements (no parentId)
      return elements.filter(e => !e.parentId);
    }
    // Inside a container - show only direct children
    return elements.filter(e => e.parentId === currentViewId);
  }, [elements, currentViewId]);
  
  // Separate departments, workers, and other elements
  const { departments, workers, managers, regularWorkers, otherElements } = useMemo(() => {
    const depts = visibleElements.filter(e => e.type === 'department');
    const ppl = visibleElements.filter(e => e.type === 'worker');
    const others = visibleElements.filter(e => e.type !== 'department' && e.type !== 'worker');
    
    // Find managers - workers with 'manages' connection to a department
    const managerIds = new Set();
    connections.forEach(conn => {
      if (conn.type === 'manages') {
        managerIds.add(conn.from);
      }
    });
    
    const mgrs = ppl.filter(p => managerIds.has(p.id));
    const regular = ppl.filter(p => !managerIds.has(p.id));
    
    return { departments: depts, workers: ppl, managers: mgrs, regularWorkers: regular, otherElements: others };
  }, [visibleElements, connections]);
  
  // Calculate positions - CLEAR HIERARCHY: departments below, workers above
  const elementPositions = useMemo(() => {
    const positions = new Map();
    
    // Calculate sphere radius based on children count
    const getSphereRadius = (deptId) => {
      const children = elements.filter(e => e.parentId === deptId);
      const childCount = children.length;
      return Math.min(MIN_SPHERE_RADIUS + childCount * 0.15, MAX_SPHERE_RADIUS);
    };
    
    const deptCount = departments.length;
    const workerCount = regularWorkers.length;
    
    // ========== LAYER 1: DEPARTMENTS - Circle at bottom ==========
    // Evenly distributed around a circle, big gaps between them
    departments.forEach((dept, idx) => {
      const radius = getSphereRadius(dept.id);
      
      if (dept.position3d) {
        positions.set(dept.id, { pos: dept.position3d, radius, hasCustomPos: true });
        return;
      }
      
      // Evenly distribute around circle
      const angle = (idx / Math.max(deptCount, 1)) * Math.PI * 2;
      // Increase ring radius based on department count to prevent overlap
      const ringRadius = DEPT_RING_RADIUS + deptCount * 0.5;
      
      const x = Math.cos(angle) * ringRadius;
      const y = DEPT_LEVEL;
      const z = Math.sin(angle) * ringRadius;
      
      positions.set(dept.id, { pos: [x, y, z], radius });
    });
    
    // ========== LAYER 2: MANAGERS - Directly above their departments ==========
    managers.forEach((mgr, idx) => {
      if (mgr.position3d) {
        positions.set(mgr.id, { pos: mgr.position3d, isManager: true, hasCustomPos: true });
        return;
      }
      
      // Find departments this manager manages
      const managedDepts = connections
        .filter(c => c.from === mgr.id && c.type === 'manages')
        .map(c => c.to);
      
      if (managedDepts.length > 0) {
        // Position directly above managed department
        const firstDeptPos = positions.get(managedDepts[0]);
        if (firstDeptPos) {
          positions.set(mgr.id, { 
            pos: [firstDeptPos.pos[0], MANAGER_LEVEL, firstDeptPos.pos[2]], 
            isManager: true 
          });
          return;
        }
      }
      
      // No managed departments - position in center above
      const angle = (idx / Math.max(managers.length, 1)) * Math.PI * 2;
      positions.set(mgr.id, { 
        pos: [Math.cos(angle) * 3, MANAGER_LEVEL, Math.sin(angle) * 3], 
        isManager: true 
      });
    });
    
    // ========== LAYER 3: REGULAR WORKERS - Top ring ==========
    regularWorkers.forEach((worker, idx) => {
      if (worker.position3d) {
        positions.set(worker.id, { pos: worker.position3d, isManager: false, hasCustomPos: true });
        return;
      }
      
      // Evenly distribute around outer ring at top
      const angle = (idx / Math.max(workerCount, 1)) * Math.PI * 2;
      const ringRadius = WORKER_RING_RADIUS + workerCount * 0.2;
      
      const x = Math.cos(angle) * ringRadius;
      const y = WORKER_LEVEL;
      const z = Math.sin(angle) * ringRadius;
      
      positions.set(worker.id, { pos: [x, y, z], isManager: false });
    });
    
    // ========== OTHER ELEMENTS - Middle ring ==========
    otherElements.forEach((el, idx) => {
      if (el.position3d) {
        positions.set(el.id, { pos: el.position3d, isOther: true, hasCustomPos: true });
        return;
      }
      
      const angle = (idx / Math.max(otherElements.length, 1)) * Math.PI * 2;
      const ringRadius = DEPT_RING_RADIUS + 4;
      
      positions.set(el.id, { 
        pos: [Math.cos(angle) * ringRadius, 3, Math.sin(angle) * ringRadius], 
        isOther: true 
      });
    });
    
    return positions;
  }, [departments, managers, regularWorkers, otherElements, elements, connections]);
  
  // Handle element selection - also handles connection creation
  const handleSelect = useCallback((id) => {
    if (isConnecting) {
      // In connecting mode - finish the connection
      finishConnecting(id);
    } else {
      // Normal selection
      selectElement(id);
    }
  }, [selectElement, isConnecting, finishConnecting]);
  
  // Handle double click
  const handleDoubleClick = useCallback((element) => {
    const elementType = ELEMENT_TYPES[element.type];
    
    console.log('3D Double click on element:', element.name, 'type:', element.type, 'canContain:', elementType?.canContain);
    
    if (elementType?.canContain) {
      // Navigate into department
      console.log('Navigating into:', element.id);
      navigateInto(element.id);
    } else {
      // Show info modal for non-container elements
      onShowInfo?.(element);
    }
  }, [navigateInto, onShowInfo]);
  
  // Handle element right-click
  const handleElementContextMenu = useCallback((e, element) => {
    onElementContextMenu?.({
      x: e.clientX || e.nativeEvent?.clientX || 100,
      y: e.clientY || e.nativeEvent?.clientY || 100,
      type: 'element',
      target: element  // Use 'target' like 2D version
    });
  }, [onElementContextMenu]);
  
  // Get connection endpoints
  const getConnectionEndpoints = useCallback((conn) => {
    const fromPos = elementPositions.get(conn.from);
    const toPos = elementPositions.get(conn.to);
    
    if (!fromPos || !toPos) return null;
    
    return {
      from: fromPos.pos,
      to: toPos.pos
    };
  }, [elementPositions]);
  
  // Filter connections for visible elements
  const visibleConnections = useMemo(() => {
    const visibleIds = new Set(visibleElements.map(e => e.id));
    return connections.filter(c => visibleIds.has(c.from) || visibleIds.has(c.to));
  }, [connections, visibleElements]);
  
  // Calculate opacity based on focus
  const getOpacity = (elementId) => {
    if (!focusedDeptId) return 1;
    if (elementId === focusedDeptId) return 1;
    
    // Check if element is inside focused department
    const element = elements.find(e => e.id === elementId);
    if (element?.parentId === focusedDeptId) return 1;
    
    return 0.15; // Semi-transparent for non-focused elements
  };
  
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <directionalLight position={[-10, -10, -5]} intensity={0.3} />
      <pointLight position={[0, 10, 0]} intensity={0.5} />
      
      {/* Grid helper */}
      <gridHelper args={[50, 50, '#1e293b', '#0f172a']} position={[0, -3, 0]} />
      
      {/* Connections - grouped by element pairs for offset calculation */}
      {(() => {
        // Group connections by element pairs to calculate offsets
        const connectionGroups = new Map();
        
        visibleConnections.forEach(conn => {
          // Create a consistent key for the element pair
          const pairKey = [conn.from, conn.to].sort().join('-');
          
          if (!connectionGroups.has(pairKey)) {
            connectionGroups.set(pairKey, []);
          }
          connectionGroups.get(pairKey).push(conn);
        });
        
        // Render connections with offsets for multiple connections between same elements
        const renderedConnections = [];
        
        connectionGroups.forEach((conns, pairKey) => {
          conns.forEach((conn, index) => {
            const endpoints = getConnectionEndpoints(conn);
            if (!endpoints) return;
            
            const opacity = Math.min(getOpacity(conn.from), getOpacity(conn.to));
            
            // Calculate offset index (centered around 0)
            const offsetIndex = index - (conns.length - 1) / 2;
            
            renderedConnections.push(
              <ConnectionLine3D
                key={conn.id}
                connection={conn}
                fromPos={endpoints.from}
                toPos={endpoints.to}
                opacity={opacity}
                offsetIndex={offsetIndex}
                onSelect={selectConnection}
                isSelected={selectedConnectionId === conn.id}
              />
            );
          });
        });
        
        return renderedConnections;
      })()}
      
      {/* Departments - clean spheres with content indicators */}
      {departments.map(dept => {
        const posData = elementPositions.get(dept.id);
        if (!posData) return null;
        
        // Get direct children for visual indicators
        const directChildren = elements.filter(e => e.parentId === dept.id);
        
        return (
          <DepartmentSphere
            key={dept.id}
            element={dept}
            position={posData.pos}
            radius={posData.radius}
            childrenData={directChildren}
            opacity={getOpacity(dept.id)}
            onSelect={handleSelect}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleElementContextMenu}
            isSelected={selectedElementId === dept.id}
            isFocused={focusedDeptId === dept.id}
          />
        );
      })}
      
      {/* Managers (above departments) */}
      {managers.map(mgr => {
        const posData = elementPositions.get(mgr.id);
        if (!posData) return null;
        
        // Find departments this manager manages
        const managedDepts = connections
          .filter(c => c.from === mgr.id && c.type === 'manages')
          .map(c => c.to);
        
        return (
          <group key={mgr.id}>
            <PersonFigure
              element={mgr}
              position={posData.pos}
              isManager={true}
              opacity={getOpacity(mgr.id)}
              onSelect={handleSelect}
              onDoubleClick={handleDoubleClick}
              onContextMenu={handleElementContextMenu}
              isSelected={selectedElementId === mgr.id}
            />
            {/* Visual connection lines from manager to managed departments */}
            {managedDepts.map(deptId => {
              const deptPos = elementPositions.get(deptId);
              if (!deptPos) return null;
              
              // Create a connection object for the visual line
              const visualConnection = {
                id: `visual-${mgr.id}-${deptId}`,
                type: 'manages',
                direction: 'outgoing'
              };
              
              return (
                <ConnectionLine3D
                  key={`visual-${mgr.id}-${deptId}`}
                  connection={visualConnection}
                  fromPos={posData.pos}
                  toPos={deptPos.pos}
                  opacity={Math.min(getOpacity(mgr.id), getOpacity(deptId))}
                  offsetIndex={0}
                />
              );
            })}
          </group>
        );
      })}
      
      {/* Regular workers (at edge) */}
      {regularWorkers.map(worker => {
        const posData = elementPositions.get(worker.id);
        if (!posData) return null;
        
        return (
          <PersonFigure
            key={worker.id}
            element={worker}
            position={posData.pos}
            isManager={false}
            opacity={getOpacity(worker.id)}
            onSelect={handleSelect}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleElementContextMenu}
            isSelected={selectedElementId === worker.id}
          />
        );
      })}
      
      {/* Other elements (services, offerings) */}
      {otherElements.map(el => {
        const posData = elementPositions.get(el.id);
        if (!posData) return null;
        
        return (
          <GenericElement3D
            key={el.id}
            element={el}
            position={posData.pos}
            opacity={getOpacity(el.id)}
            onSelect={handleSelect}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleElementContextMenu}
            isSelected={selectedElementId === el.id}
          />
        );
      })}
      
      
      {/* Camera animation when navigating */}
      <CameraController 
        targetPosition={currentViewId ? elementPositions.get(currentViewId)?.pos : null}
        targetZoom={currentViewId ? 0.6 : 1}
        navigationTrigger={currentViewId}
      />
      
      {/* Camera controls */}
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.05}
        minDistance={3}
        maxDistance={50}
        maxPolarAngle={Math.PI / 2 + 0.3}
      />
      
    </>
  );
}

// Main 3D Canvas component
function FlowchartCanvas3D() {
  const [contextMenu, setContextMenu] = useState(null);
  const [focusedDeptId, setFocusedDeptId] = useState(null);
  const [infoModal, setInfoModal] = useState(null);
  const containerRef = useRef();
  
  const currentViewId = useFlowchartStore((state) => state.currentViewId);
  const viewHistory = useFlowchartStore((state) => state.viewHistory);
  const elements = useFlowchartStore((state) => state.elements);
  const isConnecting = useFlowchartStore((state) => state.isConnecting);
  const cancelConnecting = useFlowchartStore((state) => state.cancelConnecting);
  const clearSelection = useFlowchartStore((state) => state.clearSelection);
  const navigateUp = useFlowchartStore((state) => state.navigateUp);
  const navigateToRoot = useFlowchartStore((state) => state.navigateToRoot);
  const navigateInto = useFlowchartStore((state) => state.navigateInto);
  const getElementPath = useFlowchartStore((state) => state.getElementPath);
  const addElement = useFlowchartStore((state) => state.addElement);
  const addChildElement = useFlowchartStore((state) => state.addChildElement);
  
  // Cancel connecting on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isConnecting) {
        cancelConnecting();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isConnecting, cancelConnecting]);
  
  // Build breadcrumb path
  const breadcrumbs = useMemo(() => {
    if (!currentViewId) return [];
    return getElementPath(currentViewId);
  }, [currentViewId, getElementPath]);
  
  // Handle right click - check if hovering over an element or connection
  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    
    // Check if hovering over an element or connection
    const hovered = hoveredElementRef.current;
    
    if (hovered) {
      if (hovered.type === 'connection') {
        // Show connection context menu
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          type: 'connection',
          target: hovered.connection
        });
      } else {
        // Show element context menu
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          type: 'element',
          target: hovered
        });
      }
    } else {
      // Show empty space menu
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        type: 'empty',
        target: null
      });
    }
  }, []);
  
  // Handle element context menu from 3D scene (backup)
  const handleElementContextMenu = useCallback((menuData) => {
    setContextMenu(menuData);
  }, []);
  
  // Close context menu
  const closeContextMenu = () => setContextMenu(null);
  
  // Create element from context menu (same as 2D)
  const handleCreateElement = useCallback((typeId) => {
    if (currentViewId) {
      // If inside a container, create child element
      addChildElement(currentViewId, typeId);
    } else {
      // Create root element at center
      addElement(typeId, { x: 0, y: 0 });
    }
    closeContextMenu();
  }, [currentViewId, addElement, addChildElement]);
  
  return (
    <div 
      ref={containerRef}
      className="flowchart-canvas-3d-container"
      onContextMenu={handleContextMenu}
    >
      {/* Breadcrumbs navigation */}
      {currentViewId && (
        <div className="breadcrumbs-3d">
          <button className="breadcrumb-btn" onClick={navigateToRoot}>
            <span>🏠</span> Корень
          </button>
          {breadcrumbs.map((el, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            const icon = ELEMENT_TYPES[el.type]?.icon || '📁';
            return (
              <span key={el.id} className="breadcrumb-item">
                <span className="breadcrumb-separator">/</span>
                <span 
                  className={`breadcrumb-name ${isLast ? 'current' : 'clickable'}`}
                  onClick={() => !isLast && navigateInto(el.id)}
                  style={{ cursor: isLast ? 'default' : 'pointer' }}
                >
                  {icon} {el.name}
                </span>
              </span>
            );
          })}
          {breadcrumbs.length > 0 && (
            <button className="breadcrumb-btn up-btn" onClick={navigateUp}>
              <span>⬆️</span> Наверх
            </button>
          )}
        </div>
      )}
      
      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [25, 20, 25], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'linear-gradient(180deg, #0f172a 0%, #1e1b4b 100%)' }}
        onPointerMissed={(e) => {
          // Left click on empty space - clear selection
          if (e.button === 0) {
            clearSelection();
            setContextMenu(null);
          }
        }}
      >
        <Suspense fallback={null}>
          <SceneContent 
            focusedDeptId={focusedDeptId}
            onContextMenu={handleContextMenu}
            onElementContextMenu={handleElementContextMenu}
            onShowInfo={setInfoModal}
          />
        </Suspense>
      </Canvas>
      
      {/* Connecting mode hint */}
      {isConnecting && (
        <div className="connecting-hint-3d">
          🔗 Кликните на элемент для создания связи
          <button onClick={cancelConnecting}>✕ Отмена</button>
        </div>
      )}
      
      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          type={contextMenu.type}
          target={contextMenu.target}
          onClose={closeContextMenu}
          onCreateElement={handleCreateElement}
        />
      )}
      
      {/* Info modal - rendered outside Canvas */}
      {infoModal && (
        <ElementInfoModal
          element={infoModal}
          onClose={() => setInfoModal(null)}
        />
      )}
      
      {/* Instructions overlay */}
      <div className="controls-3d">
        <div className="control-hint">🖱️ вращение</div>
        <div className="control-hint">⚙️ зум</div>
        <div className="control-hint">2×клик → внутрь</div>
      </div>
    </div>
  );
}

export default FlowchartCanvas3D;

