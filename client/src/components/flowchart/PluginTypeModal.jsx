import React from 'react';
import './PluginTypeModal.css';

const PLUGIN_OPTIONS = [
  { id: 'telegram', name: 'Telegram', icon: '🔹' },
  { id: 'whatsapp', name: 'WhatsApp', icon: '🟢' },
  { id: 'viber', name: 'Viber', icon: '🟣' },
  { id: 'youtube', name: 'YouTube', icon: '🔴' },
  { id: 'instagram', name: 'Instagram', icon: '🟠' }
];

export default function PluginTypeModal({ onClose, onSelect }) {
  return (
    <div className="plugin-type-modal-overlay" onClick={onClose}>
      <div className="plugin-type-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="plugin-type-modal-header">
          <h3>Выберите тип плагина</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="plugin-type-options">
          {PLUGIN_OPTIONS.map((option) => (
            <button
              key={option.id}
              className="plugin-type-option-btn"
              onClick={() => onSelect(option.id, option.name)}
            >
              <span className="plugin-icon">{option.icon}</span>
              <span className="plugin-name">{option.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
