-- ================================================================
-- Seed 002: Development Data
-- ใช้สำหรับ local dev เท่านั้น — ห้ามรันบน production
-- ================================================================

-- Users (password_hash นี้คือ bcrypt ของ "password123")
INSERT INTO users (name, email, password_hash, role) VALUES
  ('Admin User',  'admin@company.com',   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin'),
  ('สมชาย ขยัน',  'somchai@company.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'sales'),
  ('วิภา ใจดี',   'wipa@company.com',    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'sales');

-- Leads
INSERT INTO leads (name, phone, email, source, status, owner_id, note) VALUES
  ('สมหญิง รักดี',   '0812345678', 'somying@email.com',  'web',      'new',       2, 'สนใจแพ็กเกจ A'),
  ('มานะ ตั้งใจ',    '0823456789', 'mana@email.com',     'referral', 'contacted', 2, 'นัดโทรวันพุธ'),
  ('สุดา สวยงาม',    '0834567890', 'suda@email.com',     'web',      'qualified', 3, 'ยืนยันงบประมาณแล้ว'),
  ('ประสิทธิ์ เก่ง', '0845678901', NULL,                 'admin',    'new',       3, NULL),
  ('รัตนา มีสุข',    '0856789012', 'ratana@email.com',   'web',      'closed_won',2, 'ปิดดีลแล้ว');