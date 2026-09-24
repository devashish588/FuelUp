'use client';
import { useState, useSyncExternalStore } from 'react';
import './onboarding.css';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { ChevronRight, ChevronLeft, Flame, User, Ruler, Target, Zap, Dumbbell, BarChart3, Heart, ArrowDown, TrendingUp, Scale } from 'lucide-react';
import { useProfileStore } from '@/stores/profile-store';
import { generateRecommendation } from '@/lib/services/recommendation-engine';
import { calculateAge, generateId, cn } from '@/lib/utils';
import { ACTIVITY_LABELS } from '@/lib/constants';
import type { Profile, ActivityLevel } from '@/lib/types';

const STEPS = ['Welcome', 'Basic Info', 'Body Metrics', 'Your Goal'];

const emptySubscribe = () => () => {};
function useIsMounted() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

// Animated background particles
const PARTICLES = Array.from({ length: 20 }).map((_, i) => ({
  left: `${(i * 17 + 7) % 100}%`,
  top: `${(i * 23 + 13) % 100}%`,
  animationDelay: `${(i * 1.3) % 8}s`,
  animationDuration: `${6 + ((i * 1.7) % 8)}s`,
  width: `${2 + (i % 4)}px`,
  height: `${2 + (i % 4)}px`,
}));

function FloatingParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {PARTICLES.map((style, i) => (
        <div key={i} className="particle" style={style} />
      ))}
    </div>
  );
}

// Feature card component for welcome screen
function FeatureCard({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div className="feature-card group">
      <div className="feature-icon-wrap">
        <Icon className="w-5 h-5 text-[#F0A500] group-hover:text-[#FFB81C] transition-colors" />
      </div>
      <h3 className="text-sm font-semibold text-[#E6D5B8] mt-3 mb-1">{title}</h3>
      <p className="text-xs text-[#9A8C7A] leading-relaxed">{desc}</p>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useUser();
  const completeOnboarding = useProfileStore((s) => s.completeOnboarding);
  const [step, setStep] = useState(0);
  const mounted = useIsMounted();
  const [transitioning, setTransitioning] = useState(false);
  const [form, setForm] = useState({
    full_name: '', date_of_birth: '', gender: '' as 'male' | 'female' | 'other',
    weight_kg: '', height_cm: '', body_fat_percentage: '',
    activity_level: '' as ActivityLevel,
  });

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const goToStep = (nextStep: number) => {
    setTransitioning(true);
    setTimeout(() => {
      setStep(nextStep);
      setTransitioning(false);
    }, 200);
  };

  const handleComplete = () => {
    const age = form.date_of_birth ? calculateAge(form.date_of_birth) : 25;
    const rec = generateRecommendation({
      weight_kg: parseFloat(form.weight_kg) || 70,
      height_cm: parseFloat(form.height_cm) || 170,
      body_fat_percentage: form.body_fat_percentage ? parseFloat(form.body_fat_percentage) : null,
      age, gender: form.gender || 'male',
      activity_level: form.activity_level || 'moderately_active',
    });

    const profile: Profile = {
      id: generateId(), full_name: form.full_name || user?.fullName || 'User',
      // Prefer the signed-in Clerk email; empty string keeps validation honest
      // (no fake placeholder) until cloud sync lands in Phase 2.
      email: user?.primaryEmailAddress?.emailAddress ?? '',
      date_of_birth: form.date_of_birth,
      gender: form.gender || 'male', activity_level: form.activity_level || 'moderately_active',
      goal: rec.goal, unit_system: 'metric',
      daily_calorie_target: rec.daily_calories, protein_target_g: rec.protein_g,
      carbs_target_g: rec.carbs_g, fat_target_g: rec.fat_g,
      // Phase 7: fresh estimates start from the onboarding calculation.
      // No target rate is forced here — the goal default applies until edited.
      target_rate_kg_per_week: null,
      target_source: 'initial',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };

    completeOnboarding(profile);
    router.replace('/dashboard');
  };

  if (!mounted) return null;

  return (
    <div className="onboarding-root">
      <FloatingParticles />

      {/* Desktop side panel */}
      <div className="onboarding-side-panel">
        <div className="side-panel-content">
          <div className="side-logo-wrap">
            <div className="side-logo-icon">
              <Flame className="w-8 h-8 text-[#F0A500]" />
            </div>
            <span className="side-logo-text">FuelUp</span>
          </div>
          <h2 className="side-panel-heading">
            Transform your
            <span className="gradient-text-accent"> fitness journey</span>
          </h2>
          <p className="side-panel-desc">
            The all-in-one platform for tracking nutrition, workouts, body metrics, and building habits that last.
          </p>
          <div className="side-panel-stats">
            <div className="stat-pill">
              <Zap className="w-4 h-4 text-[#F0A500]" />
              <span>Smart Tracking</span>
            </div>
            <div className="stat-pill">
              <BarChart3 className="w-4 h-4 text-[#F0A500]" />
              <span>Deep Analytics</span>
            </div>
            <div className="stat-pill">
              <Heart className="w-4 h-4 text-[#E45826]" />
              <span>Health Focused</span>
            </div>
          </div>
          {/* Step indicator on desktop */}
          <div className="side-step-indicator">
            {STEPS.map((label, i) => (
              <div key={i} className={cn('side-step-item', i <= step && 'active', i === step && 'current')}>
                <div className="side-step-dot">
                  {i < step ? (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-xs font-bold">{i + 1}</span>
                  )}
                </div>
                <span className="side-step-label">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="onboarding-main">
        {/* Mobile progress bar */}
        <div className="mobile-progress">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-[#F0A500]" />
              <span className="text-sm font-bold text-[#E6D5B8]">FuelUp</span>
            </div>
            <span className="text-xs text-[#6D6354] font-medium">
              {step + 1} / {STEPS.length}
            </span>
          </div>
          <div className="progress-track">
            {STEPS.map((_, i) => (
              <div key={i} className={cn('progress-segment', i <= step && 'filled')} />
            ))}
          </div>
        </div>

        {/* Scrollable content */}
        <div className="onboarding-content-scroll">
          <div className={cn('onboarding-step-content', transitioning && 'step-exit')}>

            {/* ===== STEP 0: Welcome ===== */}
            {step === 0 && (
              <div className="step-welcome">
                <div className="welcome-hero-icon">
                  <div className="hero-icon-glow" />
                  <Flame className="w-12 h-12 text-[#F0A500] relative z-10" />
                </div>
                <h1 className="welcome-title">
                  Welcome to <span className="gradient-text-accent">FuelUp</span>
                </h1>
                <p className="welcome-subtitle">
                  Your intelligent fitness companion. Track every rep, every meal, every milestone.
                </p>

                <div className="features-grid">
                  <FeatureCard
                    icon={Scale}
                    title="Nutrition"
                    desc="Log meals and track macros with precision"
                  />
                  <FeatureCard
                    icon={Dumbbell}
                    title="Workouts"
                    desc="Record exercises and track personal records"
                  />
                  <FeatureCard
                    icon={BarChart3}
                    title="Analytics"
                    desc="Visualize progress with detailed insights"
                  />
                  <FeatureCard
                    icon={Target}
                    title="Habits"
                    desc="Build consistency with daily habit tracking"
                  />
                </div>

                <div className="welcome-cta-hint">
                  <ArrowDown className="w-4 h-4 text-[#6D6354] animate-bounce" />
                  <span className="text-xs text-[#6D6354]">Let&apos;s set up your profile</span>
                </div>
              </div>
            )}

            {/* ===== STEP 1: Basic Info ===== */}
            {step === 1 && (
              <div className="step-form">
                <div className="step-header">
                  <div className="step-icon-wrap">
                    <User className="w-6 h-6 text-[#F0A500]" />
                  </div>
                  <h2 className="step-title">About You</h2>
                  <p className="step-desc">Let&apos;s personalize your experience</p>
                </div>
                <div className="form-fields">
                  <div className="field-group">
                    <label className="field-label">Full Name</label>
                    <input
                      type="text"
                      value={form.full_name}
                      onChange={(e) => update('full_name', e.target.value)}
                      placeholder="Enter your name"
                      className="field-input"
                      id="onboarding-name"
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Date of Birth</label>
                    <input
                      type="date"
                      value={form.date_of_birth}
                      onChange={(e) => update('date_of_birth', e.target.value)}
                      className="field-input"
                      id="onboarding-dob"
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Gender</label>
                    <div className="gender-grid">
                      {(['male', 'female', 'other'] as const).map((g) => (
                        <button
                          key={g}
                          onClick={() => update('gender', g)}
                          id={`onboarding-gender-${g}`}
                          className={cn('gender-btn', form.gender === g && 'selected')}
                        >
                          <span className="capitalize">{g}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ===== STEP 2: Body Metrics ===== */}
            {step === 2 && (
              <div className="step-form">
                <div className="step-header">
                  <div className="step-icon-wrap">
                    <Ruler className="w-6 h-6 text-[#F0A500]" />
                  </div>
                  <h2 className="step-title">Body Metrics</h2>
                  <p className="step-desc">We&apos;ll use this to calculate your targets</p>
                </div>
                <div className="form-fields">
                  <div className="metrics-row">
                    <div className="field-group">
                      <label className="field-label">Weight (kg)</label>
                      <input
                        type="number"
                        value={form.weight_kg}
                        onChange={(e) => update('weight_kg', e.target.value)}
                        placeholder="70"
                        className="field-input"
                        id="onboarding-weight"
                      />
                    </div>
                    <div className="field-group">
                      <label className="field-label">Height (cm)</label>
                      <input
                        type="number"
                        value={form.height_cm}
                        onChange={(e) => update('height_cm', e.target.value)}
                        placeholder="175"
                        className="field-input"
                        id="onboarding-height"
                      />
                    </div>
                  </div>
                  <div className="field-group">
                    <label className="field-label">
                      Body Fat %
                      <span className="field-optional">optional</span>
                    </label>
                    <input
                      type="number"
                      value={form.body_fat_percentage}
                      onChange={(e) => update('body_fat_percentage', e.target.value)}
                      placeholder="15"
                      className="field-input"
                      id="onboarding-bodyfat"
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Activity Level</label>
                    <div className="activity-list">
                      {(Object.entries(ACTIVITY_LABELS) as [ActivityLevel, string][]).map(([val, label]) => (
                        <button
                          key={val}
                          onClick={() => update('activity_level', val)}
                          id={`onboarding-activity-${val}`}
                          className={cn('activity-btn', form.activity_level === val && 'selected')}
                        >
                          <div className="activity-radio">
                            {form.activity_level === val && <div className="activity-radio-fill" />}
                          </div>
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ===== STEP 3: Personalized Plan ===== */}
            {step === 3 && (
              <div className="step-form">
                <div className="step-header">
                  <div className="step-icon-wrap">
                    <Target className="w-6 h-6 text-[#F0A500]" />
                  </div>
                  <h2 className="step-title">Your Personalized Plan</h2>
                  <p className="step-desc">Based on your metrics, here&apos;s our recommendation</p>
                </div>
                {(() => {
                  const rec = generateRecommendation({
                    weight_kg: parseFloat(form.weight_kg) || 70,
                    height_cm: parseFloat(form.height_cm) || 170,
                    body_fat_percentage: form.body_fat_percentage ? parseFloat(form.body_fat_percentage) : null,
                    age: form.date_of_birth ? calculateAge(form.date_of_birth) : 25,
                    gender: form.gender || 'male',
                    activity_level: form.activity_level || 'moderately_active',
                  });
                  const goalIcon = rec.goal === 'cut' ? Flame : rec.goal === 'bulk' ? TrendingUp : Scale;
                  const GoalIcon = goalIcon;
                  return (
                    <div className="plan-results">
                      {/* Goal recommendation card */}
                      <div className="plan-card goal-card">
                        <div className="plan-card-header">
                          <div className="goal-icon-wrap">
                            <GoalIcon className="w-6 h-6 text-[#F0A500]" />
                          </div>
                          <div>
                            <h3 className="plan-card-title capitalize">Recommended: {rec.goal}</h3>
                            <p className="plan-card-meta">TDEE: {rec.tdee} kcal/day</p>
                          </div>
                        </div>
                        <p className="plan-card-reason">{rec.reason}</p>
                      </div>

                      {/* Macro targets */}
                      <div className="plan-card">
                        <h4 className="plan-section-title">Daily Targets</h4>
                        <div className="macro-grid">
                          <div className="macro-item macro-calories">
                            <div className="macro-value">{rec.daily_calories}</div>
                            <div className="macro-label">Calories</div>
                            <div className="macro-bar">
                              <div className="macro-bar-fill cal-fill" style={{ width: '100%' }} />
                            </div>
                          </div>
                          <div className="macro-item macro-protein">
                            <div className="macro-value">{rec.protein_g}g</div>
                            <div className="macro-label">Protein</div>
                            <div className="macro-bar">
                              <div className="macro-bar-fill pro-fill" style={{ width: '85%' }} />
                            </div>
                          </div>
                          <div className="macro-item macro-carbs">
                            <div className="macro-value">{rec.carbs_g}g</div>
                            <div className="macro-label">Carbs</div>
                            <div className="macro-bar">
                              <div className="macro-bar-fill carb-fill" style={{ width: '70%' }} />
                            </div>
                          </div>
                          <div className="macro-item macro-fat">
                            <div className="macro-value">{rec.fat_g}g</div>
                            <div className="macro-label">Fat</div>
                            <div className="macro-bar">
                              <div className="macro-bar-fill fat-fill" style={{ width: '50%' }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="onboarding-nav">
          {step > 0 && (
            <button
              onClick={() => goToStep(step - 1)}
              className="nav-back-btn"
              id="onboarding-back"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={() => step < 3 ? goToStep(step + 1) : handleComplete()}
            className="nav-next-btn"
            id="onboarding-next"
          >
            <span>{step === 3 ? 'Start Your Journey' : 'Continue'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

