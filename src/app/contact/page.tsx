'use client';

import { useState } from 'react';
import { Mail, MapPin, CheckCircle, Send } from 'lucide-react';
import { XIcon, FacebookIcon, InstagramIcon } from '@/components/ui/SocialIcons';
import { BRAND } from '@/config/brand';

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setSubmitted(true);
      setLoading(false);
    }, 1200);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-black text-slate-900 mb-3">Επικοινωνία</h1>
        <p className="text-lg text-slate-500">
          Έχεις ερώτηση, πρόταση ή θέλεις να συνεργαστείς; Γράψε μας.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Contact info */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
            <div className="w-9 h-9 bg-red-100 rounded-lg flex items-center justify-center mb-3">
              <Mail size={18} className="text-red-600" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm mb-1">Email</h3>
            <a
              href={`mailto:${BRAND.email}`}
              className="text-red-600 hover:text-red-700 text-sm"
            >
              {BRAND.email}
            </a>
          </div>

          <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
            <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center mb-3">
              <MapPin size={18} className="text-blue-600" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm mb-1">Έδρα</h3>
            <p className="text-slate-500 text-sm">Αθήνα, Ελλάδα</p>
          </div>

          <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
            <h3 className="font-bold text-slate-900 text-sm mb-3">Social Media</h3>
            <div className="flex gap-3">
              {BRAND.twitter && (
                <a
                  href={BRAND.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 bg-slate-100 hover:bg-[#1DA1F2] text-slate-600 hover:text-white rounded-lg flex items-center justify-center transition-colors"
                >
                  <XIcon size={16} />
                </a>
              )}
              {BRAND.facebook && (
                <a
                  href={BRAND.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 bg-slate-100 hover:bg-[#1877F2] text-slate-600 hover:text-white rounded-lg flex items-center justify-center transition-colors"
                >
                  <FacebookIcon size={16} />
                </a>
              )}
              {BRAND.instagram && (
                <a
                  href={BRAND.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 bg-slate-100 hover:bg-[#E1306C] text-slate-600 hover:text-white rounded-lg flex items-center justify-center transition-colors"
                >
                  <InstagramIcon size={16} />
                </a>
              )}
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 text-sm text-slate-600">
            <p className="font-semibold text-slate-700 mb-1">Για δημοσιογράφους</p>
            <p>
              Αν ψάχνετε για σχολιασμό από την ομάδα μας, επικοινωνήστε στο{' '}
              <a href={`mailto:${BRAND.pressEmail}`} className="text-red-600">
                {BRAND.pressEmail}
              </a>
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="md:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          {submitted ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle size={32} className="text-emerald-600" />
              </div>
              <h2 className="text-xl font-black text-slate-900 mb-2">Το μήνυμά σου στάλθηκε!</h2>
              <p className="text-slate-500">
                Θα σου απαντήσουμε εντός 1-2 εργάσιμων ημερών.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <h2 className="text-lg font-black text-slate-900 mb-2">Στείλε μήνυμα</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Όνομα *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Το όνομά σου"
                    className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="email@σου.com"
                    className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-400 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Θέμα *
                </label>
                <input
                  type="text"
                  required
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Γράψε το θέμα σου"
                  className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-400 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Μήνυμα *
                </label>
                <textarea
                  required
                  rows={5}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Γράψε το μήνυμά σου εδώ..."
                  className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-400 transition-colors resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-70 text-white font-bold py-3 rounded-lg transition-colors"
              >
                {loading ? (
                  'Αποστολή...'
                ) : (
                  <>
                    <Send size={15} />
                    Αποστολή Μηνύματος
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
