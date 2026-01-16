/* eslint-disable react/no-unescaped-entities */
import React, { useState, useEffect } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import {
    ArrowDown,
    Cpu,
    Zap,
    BarChart,
    Users,
    Layers,
    Globe,
    ShieldCheck,
    TrendingUp
} from 'lucide-react';
import './AgencyLanding.css';

// --- Components ---

const HeroSection = () => {
    const [step, setStep] = useState(0);
    const steps = [
        { id: 'business', label: 'БИЗНЕС' },
        { id: 'partner', label: 'ПАРТНЁРСТВО' },
        { id: 'systems', label: 'СИСТЕМЫ' },
        { id: 'growth', label: 'РОСТ' },
        { id: 'profit', label: 'ПРИБЫЛЬ' },
        { id: 'share', label: '% НАМ' },
    ];

    useEffect(() => {
        const timer = setInterval(() => {
            setStep((prev) => (prev + 1) % (steps.length + 2)); // +2 for pause at the end
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
                THE ENGINE
            </motion.h1>
            <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="hero-subtitle"
            >
                Операционный Equity Партнёрство. <br />
                Мы не продаём время. Мы инвестируем технологии.
            </motion.p>

            <div className="flow-container">
                {steps.map((s, i) => (
                    <React.Fragment key={s.id}>
                        <motion.div
                            className={`flow-node ${step >= i ? 'active' : ''} ${s.id === 'profit' && step >= i ? 'profit' : ''}`}
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{
                                scale: step === i ? 1.1 : 1,
                                opacity: 1,
                                borderColor: step >= i ? (s.id === 'profit' ? '#0aff00' : '#00f3ff') : '#333'
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
                <div className="energy-line"></div>
                <div className="energy-pulse"></div>
            </div>
        </section>
    );
};

const IdentitySection = () => {
    return (
        <section className="section bg-black">
            <div className="glass-card">
                <div className="morph-text">
                    <AnimatePresence mode='wait'>
                        <motion.div
                            initial={{ opacity: 0, filter: 'blur(10px)' }}
                            whileInView={{ opacity: 1, filter: 'blur(0px)' }}
                            viewport={{ once: true }}
                            transition={{ duration: 1 }}
                        >
                            <span className="text-dim strikethrough decoration-4 decoration-purple-500 mr-4">ПОДРЯДЧИК</span>
                            <span className="text-dim strikethrough decoration-4 decoration-purple-500 mr-4">АГЕНТСТВО</span>
                            <span className="text-neon-blue">ОПЕРАЦИОННЫЙ ПАРТНЁР</span>
                        </motion.div>
                    </AnimatePresence>
                </div>
                <p className="text-center mt-8 text-dim max-w-lg mx-auto">
                    Мы внутри бизнеса. Мы в одной команде. <br />
                    Skin in the game.
                </p>
            </div>
        </section>
    );
};

const ProcessSection = () => {
    const steps = ['ЗАПРОС', 'АУДИТ', 'ПЛАН РОСТА', 'ДОГОВОР С %', 'ЗАПУСК'];
    return (
        <section className="section">
            <h2 className="text-4xl font-bold mb-12 font-mono">INTEGRATION PROTOCOL</h2>
            <div className="flex flex-wrap justify-center gap-4">
                {steps.map((step, i) => (
                    <motion.div
                        key={step}
                        initial={{ opacity: 0, x: -50 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.2 }}
                        className="flex items-center"
                    >
                        <div className="px-6 py-3 border border-gray-800 bg-gray-900 rounded-full font-mono text-sm hover:border-neon-blue transition-colors">
                            {step}
                        </div>
                        {i < steps.length - 1 && <div className="w-8 h-[1px] bg-gray-800 mx-2" />}
                    </motion.div>
                ))}
            </div>
        </section>
    )
}

const CapabilitiesSection = () => {
    const caps = [
        { icon: <Globe />, label: 'МАРКЕТИНГ' },
        { icon: <Layers />, label: 'СИСТЕМЫ' },
        { icon: <Cpu />, label: 'AI & AUTOMATION' },
        { icon: <Users />, label: 'ПРОЦЕССЫ' },
    ];

    return (
        <section className="section">
            <h2 className="text-4xl font-bold mb-16 font-mono">CAPABILITIES</h2>
            <div className="grid-container">
                {caps.map((cap) => (
                    <motion.div
                        key={cap.label}
                        className="grid-item"
                        whileHover={{ scale: 1.05 }}
                    >
                        <div className="grid-icon">{cap.icon}</div>
                        <h3 className="text-xl font-bold font-mono">{cap.label}</h3>
                    </motion.div>
                ))}
            </div>
            <div className="mt-16 text-center">
                <ArrowDown className="mx-auto mb-4 animate-bounce text-neon-blue" />
                <h3 className="text-2xl font-bold text-neon-green">[ РОСТ БИЗНЕСА ]</h3>
            </div>
        </section>
    );
};

const PlatformSection = () => {
    return (
        <section className="section">
            <div className="w-full max-w-4xl relative">
                <div className="absolute inset-0 bg-neon-blue opacity-5 blur-3xl rounded-full"></div>
                <div className="glass-card relative z-10 border-t-2 border-neon-blue">
                    <div className="flex justify-between items-center border-b border-gray-800 pb-4 mb-8">
                        <span className="font-mono text-neon-blue">SYSTEM: ONLINE</span>
                        <div className="flex gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-500"></div>
                            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                            <div className="w-3 h-3 rounded-full bg-green-500"></div>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-8 text-center">
                        <div>
                            <Users className="mx-auto mb-4 text-purple-400" size={32} />
                            <h4 className="font-mono font-bold">КОМАНДА</h4>
                            <div className="text-xs text-dim mt-2">Distributed Expert Force</div>
                        </div>
                        <div>
                            <BarChart className="mx-auto mb-4 text-neon-green" size={32} />
                            <h4 className="font-mono font-bold">АНАЛИТИКА</h4>
                            <div className="text-xs text-dim mt-2">Real-time Metrics</div>
                        </div>
                        <div>
                            <Zap className="mx-auto mb-4 text-neon-blue" size={32} />
                            <h4 className="font-mono font-bold">ИНТЕГРАЦИИ</h4>
                            <div className="text-xs text-dim mt-2">Seamless API</div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

const MoneySection = () => {
    return (
        <section className="section">
            <h2 className="text-4xl font-bold mb-8 font-mono">REVENUE SHARE</h2>
            <div className="flex gap-8 items-end h-64">
                <motion.div
                    initial={{ height: 0 }}
                    whileInView={{ height: '100%' }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    className="w-32 bg-gradient-to-t from-gray-900 to-white rounded-t-lg relative group"
                >
                    <div className="absolute bottom-4 w-full text-center font-bold text-black drop-shadow-md">ВАШ РОСТ</div>
                </motion.div>
                <div className="pb-8 text-2xl text-dim">=</div>
                <motion.div
                    initial={{ height: 0 }}
                    whileInView={{ height: '30%' }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.5, delay: 0.5, ease: "easeOut" }}
                    className="w-16 bg-gradient-to-t from-black to-neon-green rounded-t-lg relative"
                >
                    <div className="absolute -top-8 w-full text-center text-neon-green font-mono font-bold">%</div>
                </motion.div>
            </div>
            <p className="mt-8 font-mono text-neon-green">Profit_Agency = f(Client_Growth)</p>
        </section>
    )
}

const FinalSection = () => {
    return (
        <section className="section bg-black">
            <div className="text-center z-10">
                <h2 className="text-5xl md:text-7xl font-bold mb-8 leading-tight">
                    МЫ НЕ ПРОДАЁМ УСЛУГИ. <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-neon-purple">
                        МЫ СТРОИМ ИМПЕРИИ.
                    </span>
                </h2>

                <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    className="cta-button mt-12 bg-black bg-opacity-50 backdrop-blur-sm"
                >
                    [ INITIATE PARTNERSHIP ]
                </motion.button>
            </div>

            {/* Background Particles (Simulated) */}
            <div className="absolute inset-0 z-0 opacity-20" style={{
                backgroundImage: 'radial-gradient(circle at center, #111 1px, transparent 1px)',
                backgroundSize: '40px 40px'
            }}></div>
        </section>
    );
};

// --- Main Page Component ---

const AgencyLanding = () => {
    return (
        <div className="agency-landing">
            <HeroSection />
            <IdentitySection />
            <ProcessSection />
            <CapabilitiesSection />
            <PlatformSection />
            <MoneySection />
            <FinalSection />

            {/* Global "Line" overlay */}
            <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-50 mix-blend-overlay opacity-20"
                style={{ background: 'linear-gradient(transparent 50%, rgba(0,0,0,0.5) 50%)', backgroundSize: '100% 4px' }}
            ></div>
        </div>
    );
};

export default AgencyLanding;
