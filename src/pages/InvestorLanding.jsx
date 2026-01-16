/* eslint-disable react/no-unescaped-entities */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowDown,
    Cpu,
    Zap,
    BarChart,
    Users,
    Globe,
    TrendingUp,
    Database,
    Lock
} from 'lucide-react';
import './AgencyLanding.css'; // Reusing the same styles

// --- Components ---

const HeroSection = () => {
    const [step, setStep] = useState(0);
    const steps = [
        { id: 'capital', label: 'CAPITAL' },
        { id: 'tech', label: 'TECHNOLOGY' },
        { id: 'operations', label: 'OPERATIONS' },
        { id: 'scaling', label: 'SCALING' },
        { id: 'exit', label: 'EXIT / IPO' },
    ];

    useEffect(() => {
        const timer = setInterval(() => {
            setStep((prev) => (prev + 1) % (steps.length + 2));
        }, 1200);
        return () => clearInterval(timer);
    }, [steps.length]);

    return (
        <section className="section hero-section">
            <motion.h1
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                className="hero-title"
            >
                VENTURE BUILDER
            </motion.h1>
            <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="hero-subtitle"
            >
                Operational Alpha. <br />
                Превращаем операционные процессы в капитализируемые активы.
            </motion.p>

            <div className="flow-container">
                {steps.map((s, i) => (
                    <React.Fragment key={s.id}>
                        <motion.div
                            className={`flow-node ${step >= i ? 'active' : ''} ${s.id === 'exit' && step >= i ? 'profit' : ''}`}
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{
                                scale: step === i ? 1.1 : 1,
                                opacity: 1,
                                borderColor: step >= i ? (s.id === 'exit' ? '#0aff00' : '#bd00ff') : '#333'
                            }}
                        >
                            {s.label}
                        </motion.div>
                        {i < steps.length - 1 && (
                            <ArrowDown className={`flow-arrow ${step > i ? 'active' : ''}`} />
                        )}
                    </React.Fragment>
                ))}
            </div>

            <div className="energy-line-container">
                <div className="energy-line" style={{ background: 'linear-gradient(to bottom, #bd00ff 0%, #00f3ff 50%, #0aff00 100%)' }}></div>
                <div className="energy-pulse"></div>
            </div>
        </section>
    );
};

const AssetsSection = () => {
    return (
        <section className="section">
            <h2 className="text-4xl font-bold mb-12 font-mono">ASSET ACCUMULATION</h2>
            <div className="grid-container">
                <motion.div className="grid-item" whileHover={{ scale: 1.05 }}>
                    <div className="grid-icon"><Database /></div>
                    <h3 className="text-xl font-bold font-mono">BIG DATA</h3>
                    <p className="text-sm text-dim mt-2">Aggregated from all portfolio companies</p>
                </motion.div>
                <motion.div className="grid-item" whileHover={{ scale: 1.05 }}>
                    <div className="grid-icon"><Cpu /></div>
                    <h3 className="text-xl font-bold font-mono">PROPRIETARY AI</h3>
                    <p className="text-sm text-dim mt-2">Trained on real operational datasets</p>
                </motion.div>
                <motion.div className="grid-item" whileHover={{ scale: 1.05 }}>
                    <div className="grid-icon"><Lock /></div>
                    <h3 className="text-xl font-bold font-mono">INTELLECTUAL PROPERTY</h3>
                    <p className="text-sm text-dim mt-2">Reusable core tech stack</p>
                </motion.div>
            </div>
        </section>
    )
}

const ScalabilitySection = () => {
    return (
        <section className="section">
            <div className="w-full max-w-4xl relative">
                <div className="absolute inset-0 bg-purple-600 opacity-5 blur-3xl rounded-full"></div>
                <div className="glass-card relative z-10 border-t-2 border-purple-500">
                    <div className="flex justify-between items-center border-b border-gray-800 pb-4 mb-8">
                        <span className="font-mono text-purple-400">SCALE: UNLIMITED</span>
                    </div>
                    <div className="flex justify-center items-end gap-2 h-40">
                        {[20, 35, 50, 65, 80, 95, 110, 130].map((h, i) => (
                            <motion.div
                                key={i}
                                initial={{ height: 0 }}
                                whileInView={{ height: `${h}%` }}
                                transition={{ delay: i * 0.1 }}
                                className="w-8 bg-purple-500 rounded-t-sm opacity-80 hover:opacity-100 transition-opacity"
                            />
                        ))}
                    </div>
                    <p className="text-center mt-8 font-mono">
                        Одна команда управляет 50+ проектами через <span className="text-neon-blue">Aiternitas Platform</span>.
                    </p>
                </div>
            </div>
        </section>
    );
};

const ReturnsSection = () => {
    return (
        <section className="section">
            <h2 className="text-4xl font-bold mb-8 font-mono">THE ALPHA</h2>
            <div className="flex flex-col gap-4 text-center">
                <h3 className="text-2xl text-dim">Traditional VC: <span className="text-white">Capital Only</span></h3>
                <ArrowDown className="mx-auto text-dim" />
                <h3 className="text-3xl text-neon-blue font-bold">Venture Builder: <span className="text-neon-green">Capital + Operations + Tech</span></h3>
            </div>

            <div className="mt-12 p-6 border border-neon-green rounded bg-green-900 bg-opacity-10">
                <div className="font-mono text-xl text-neon-green">
                    RISK REDUCTION via CONTROL
                </div>
            </div>
        </section>
    )
}

const FinalSection = () => {
    return (
        <section className="section bg-black">
            <div className="text-center z-10">
                <h2 className="text-5xl md:text-7xl font-bold mb-8 leading-tight">
                    INVEST IN <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-neon-green">
                        SYSTEMIC GROWTH
                    </span>
                </h2>

                <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    className="cta-button mt-12 bg-black bg-opacity-50 backdrop-blur-sm"
                    style={{ borderColor: '#bd00ff', color: '#bd00ff' }}
                >
                    [ REQUEST ACCESS DECK ]
                </motion.button>
            </div>

            <div className="absolute inset-0 z-0 opacity-20" style={{
                backgroundImage: 'radial-gradient(circle at center, #111 1px, transparent 1px)',
                backgroundSize: '40px 40px'
            }}></div>
        </section>
    );
};

const InvestorLanding = () => {
    return (
        <div className="agency-landing">
            <HeroSection />
            <AssetsSection />
            <ScalabilitySection />
            <ReturnsSection />
            <FinalSection />

            <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-50 mix-blend-overlay opacity-20"
                style={{ background: 'linear-gradient(transparent 50%, rgba(0,0,0,0.5) 50%)', backgroundSize: '100% 4px' }}
            ></div>
        </div>
    );
};

export default InvestorLanding;
