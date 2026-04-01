/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { 
  Search, 
  User as UserIcon, 
  CreditCard, 
  CheckCircle, 
  LogOut, 
  ShieldCheck, 
  Download,
  Database,
  AlertCircle,
  Loader2,
  Pencil,
  Check,
  Mail,
  RefreshCw,
  Delete,
  Trophy
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types
interface Student {
  bitsId: string;
  name: string;
  hostel: string;
  roomNo: string;
  email: string;
}

interface Donation {
  id?: string;
  bitsId: string;
  amount: number;
  paymentMode: 'swd' | 'upi';
  timestamp: string;
  volunteerEmail: string;
}

type Step = 'lookup' | 'confirm' | 'verify' | 'amount' | 'success' | 'admin' | 'leaderboard';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [step, setStep] = useState<Step>('lookup');
  const [bitsId, setBitsId] = useState('');
  const [currentStudent, setCurrentStudent] = useState<Student | null>(null);
  const [searchResults, setSearchResults] = useState<Student[]>([]);
  const [amount, setAmount] = useState<number | null>(null);
  const [paymentMode, setPaymentMode] = useState<'swd' | 'upi'>('upi');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [isOtherAmount, setIsOtherAmount] = useState(false);

  // OTP state
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(4).fill(''));
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [stats, setStats] = useState({
    total: 0,
    upi: 0,
    swd: 0,
    donorCount: 0
  });

  const [hostelLeaderboard, setHostelLeaderboard] = useState<{ hostel: string, count: number }[]>([]);
  const [volunteerLeaderboard, setVolunteerLeaderboard] = useState<{ email: string, name: string, count: number }[]>([]);

  const adminEmails = ['kanishkagrawal1302banswara@gmail.com', 'f20220869@pilani.bits-pilani.ac.in'];
  const isAdmin = user?.email && adminEmails.includes(user.email);

  // Auth Listener
  useEffect(() => {
    const handleAuthStatus = async (session: any) => {
      if (session?.user?.email) {
        const email = session.user.email;
        const domain = email.split('@')[1];
        const validDomains = [
          'pilani.bits-pilani.ac.in', 
          'bits-pilani.ac.in', 
          'goa.bits-pilani.ac.in', 
          'hyderabad.bits-pilani.ac.in'
        ];
        
        // Prevent all outside logins except for the original developer admin account
        if (!validDomains.includes(domain) && email !== 'kanishkagrawal1302banswara@gmail.com') {
          await supabase.auth.signOut();
          setError('Unauthorized! Only BITS Pilani email addresses are allowed.');
          setUser(null);
          setIsAuthReady(true);
          return;
        }
      }
      setUser(session?.user ?? null);
      setIsAuthReady(true);
    };

    supabase.auth.getSession().then(({ data: { session } }) => handleAuthStatus(session));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleAuthStatus(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Clear messages after 5 seconds
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  // Global Keyboard Navigation (Enter/Escape)
  useEffect(() => {
    const handleGlobalKeydown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInputFocused = ['input', 'textarea'].includes(activeTag || '');

      if (e.key === 'Escape') {
        if (isInputFocused) {
          if (editingField) { setEditingField(null); return; }
          if (isOtherAmount) { setIsOtherAmount(false); return; }
          (document.activeElement as HTMLElement)?.blur();
          return;
        }

        if (step === 'confirm') setStep('lookup');
        else if (step === 'amount') setStep('confirm');
        else if (step === 'verify') setStep('amount');
        else if (step === 'success' || step === 'admin' || step === 'leaderboard') resetForm();
      }

      if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key) && step === 'amount' && !isInputFocused) {
        e.preventDefault();
        
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          const amounts = [365, 500, 750, 1000, 1500, 2100, 3100, 5100, 'other'];
          let idx = isOtherAmount ? 8 : amounts.indexOf(amount as number);
          
          if (idx === -1) idx = e.key === 'ArrowRight' ? 0 : amounts.length - 1;
          else if (e.key === 'ArrowRight') idx = (idx + 1) % amounts.length;
          else if (e.key === 'ArrowLeft') idx = (idx - 1 + amounts.length) % amounts.length;

          const nextVal = amounts[idx];
          if (nextVal === 'other') {
            setIsOtherAmount(true);
            setAmount(null);
          } else {
            setIsOtherAmount(false);
            setAmount(nextVal as number);
          }
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          // Toggle between upi and swd
          setPaymentMode(prev => prev === 'upi' ? 'swd' : 'upi');
        }
      }

      if (e.key === 'Enter') {
        // Let inline text edits and OTP inputs handle their own Enter keys natively
        const isTextInput = activeTag === 'input' && (document.activeElement as HTMLInputElement).type === 'text';
        if (isTextInput || activeTag === 'textarea') return;

        // If keyboard users explicitly tabbed to the "Back" button, let them go back
        if (activeTag === 'button' && document.activeElement?.textContent?.toLowerCase().includes('back')) {
          return; 
        }

        e.preventDefault();
        (document.activeElement as HTMLElement)?.blur();

        if (step === 'confirm' && !editingField) {
          setStep('amount');
        } else if (step === 'amount' && amount) {
          const amountNextBtn = document.getElementById('amount-next-btn');
          if (amountNextBtn && !amountNextBtn.hasAttribute('disabled')) amountNextBtn.click();
        } else if (step === 'verify') {
          const verifyBtn = document.getElementById('verify-next-btn');
          if (verifyBtn && !verifyBtn.hasAttribute('disabled')) verifyBtn.click();
        } else if (step === 'success') {
          resetForm();
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeydown);
    return () => window.removeEventListener('keydown', handleGlobalKeydown);
  }, [step, editingField, amount, isOtherAmount]); // paymentMode is handled via setter callback `setPaymentMode(prev => ...)` so it is safe to omit.

  // Global Mobile Swipe Back
  useEffect(() => {
    let touchStartX = 0;
    let touchStartY = 0;
    
    const handleTouchStart = (e: TouchEvent) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const touchEndX = e.changedTouches[0].screenX;
      const touchEndY = e.changedTouches[0].screenY;
      
      const xDiff = touchEndX - touchStartX;
      const yDiff = touchEndY - touchStartY;
      
      // Swipe Back Feature: Bi-directional horizontal swipe mapping. 
      // Math.abs allows both Left-to-Right and Right-to-Left swipes, overriding OS-specific behaviors when touch-pan-y is applied.
      if (Math.abs(xDiff) > 70 && Math.abs(yDiff) < 60) {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        const isInputFocused = ['input', 'textarea'].includes(activeTag || '');

        if (isInputFocused) {
          if (editingField) { setEditingField(null); return; }
          if (isOtherAmount) { setIsOtherAmount(false); return; }
          (document.activeElement as HTMLElement)?.blur();
          return;
        }

        if (step === 'confirm') setStep('lookup');
        else if (step === 'amount') setStep('confirm');
        else if (step === 'verify') setStep('amount');
        else if (step === 'success' || step === 'admin' || step === 'leaderboard') resetForm();
      }
    };

    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [step, editingField, isOtherAmount]);

  // Robust Auto-focus for OTP input after loading finishes
  useEffect(() => {
    if (step === 'verify' && !otpLoading && !otpVerified) {
      const timer = setTimeout(() => {
        for (let i = 0; i < 4; i++) {
          const input = document.getElementById(`otp-${i}`) as HTMLInputElement;
          if (input && !input.value) {
            input.focus();
            break;
          }
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [step, otpLoading, otpVerified]);

  // Helper to bypass Supabase 1000 row limit
  const fetchAllRecords = async (tableName: string) => {
    let allRecords: any[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase.from(tableName).select('*').range(from, from + 999);
      if (error) throw error;
      if (data) {
        allRecords.push(...data);
        if (data.length < 1000) break;
        from += 1000;
      } else {
        break;
      }
    }
    return allRecords;
  };

  // Admin Stats Listener
  useEffect(() => {
    if (step === 'admin' && isAdmin) {
      const fetchStats = async () => {
        const { data, error: err } = await supabase
          .from('donations')
          .select('*');
        
        if (err) {
          console.error("Stats error:", err);
          return;
        }

        const donations = data as Donation[];
        const total = donations.reduce((acc, d) => acc + d.amount, 0);
        const upi = donations.filter(d => d.paymentMode === 'upi').reduce((acc, d) => acc + d.amount, 0);
        const swd = donations.filter(d => d.paymentMode === 'swd').reduce((acc, d) => acc + d.amount, 0);
        const donorCount = new Set(donations.map(d => d.bitsId)).size;
        setStats({ total, upi, swd, donorCount });
      };

      fetchStats();
      
      const channel = supabase
        .channel('donations_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'donations' }, () => {
          fetchStats();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [step, isAdmin]);

  // Leaderboard Listener
  useEffect(() => {
    if (step === 'leaderboard') {
      const fetchLeaderboard = async () => {
        try {
          const donations = await fetchAllRecords('donations') as any[];
          const students = await fetchAllRecords('students') as Student[];

          // Calculate top 5 hostels
          const hostelCounts: Record<string, number> = {};
          donations.forEach(d => {
            const dId = d.bitsId?.trim().toLowerCase() || '';
            if (!dId) return;
            const student = students.find(s => s.bitsId?.trim().toLowerCase() === dId);
            const hostel = (student?.hostel || '').trim() || 'Unknown';
            hostelCounts[hostel] = (hostelCounts[hostel] || 0) + 1;
          });
          const topHostels = Object.entries(hostelCounts)
            .map(([hostel, count]) => ({ hostel, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

          // Calculate top 5 volunteers
          const volCounts: Record<string, { count: number; name: string }> = {};
          donations.forEach(d => {
            const email = d.volunteerEmail?.trim();
            const storedName = d.volunteerName?.trim();
            if (email) {
              if (!volCounts[email]) {
                volCounts[email] = { count: 0, name: storedName || '' };
              }
              volCounts[email].count += 1;
              if (storedName && !volCounts[email].name) {
                volCounts[email].name = storedName;
              }
            }
          });
          
          const topVolunteers = Object.entries(volCounts)
            .map(([email, data]) => {
              let name = data.name;
              if (!name) {
                const emailLower = email.toLowerCase();
                const emailPrefix = emailLower.split('@')[0];
                const student = students.find(s => {
                  const sEmail = s.email?.trim().toLowerCase();
                  if (sEmail === emailLower) return true;
                  if (sEmail && sEmail.split('@')[0] === emailPrefix) return true;
                  return false;
                });
                name = student?.name?.trim() || '';
                
                if (!name) {
                  name = emailPrefix;
                  if (/^f\d{8}$/i.test(name)) name = name.toUpperCase();
                }
              }
              return { email, name, count: data.count };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

          setHostelLeaderboard(topHostels);
          setVolunteerLeaderboard(topVolunteers);
        } catch (err) {
          console.error("Leaderboard fetch error:", err);
        }
      };

      fetchLeaderboard();
      
      const channel = supabase
        .channel('leaderboard_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'donations' }, () => {
          fetchLeaderboard();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [step]);

  const [isDbReady, setIsDbReady] = useState<boolean | null>(null);

  // Test Connection
  useEffect(() => {
    async function testConnection() {
      const { error: studentError } = await supabase.from('students').select('bitsId').limit(1);
      const { error: donationError } = await supabase.from('donations').select('id').limit(1);
      
      const error = studentError || donationError;
      
      if (error) {
        console.error("Please check your Supabase configuration:", error.message);
        if (error.message.includes('Could not find the table') || error.code === '42P01') {
          setIsDbReady(false);
        } else {
          setIsDbReady(true);
        }
      } else {
        setIsDbReady(true);
      }
    }
    testConnection();
  }, []);

  const handleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: {
            prompt: 'select_account'
          }
        }
      });
      if (error) throw error;
    } catch (err) {
      setError('Login failed. Please try again.');
    }
  };

  const handleLogout = () => supabase.auth.signOut();

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bitsId.trim()) return;
    
    (document.activeElement as HTMLElement)?.blur();
    
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('students')
        .select('*')
        .ilike('bitsId', '%' + bitsId.trim().toUpperCase());

      if (err) throw err;
      
      if (data && data.length > 0) {
        if (data.length === 1) {
          setCurrentStudent(data[0] as Student);
          setStep('confirm');
        } else {
          setSearchResults(data as Student[]);
        }
      } else {
        setError('No student found matching those digits.');
      }
    } catch (err) {
      setError('Error fetching student details.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateStudentField = async (field: keyof Student, value: string) => {
    if (!currentStudent) return;
    const updatedStudent = { ...currentStudent, [field]: value };
    setCurrentStudent(updatedStudent);
    
    try {
      const { error } = await supabase
        .from('students')
        .upsert(updatedStudent);
      if (error) throw error;
    } catch (err) {
      console.error("Failed to update student record:", err);
    }
  };

  const handleConfirmDonation = async () => {
    if (!currentStudent || !amount || !user) return;

    setLoading(true);
    try {
      const donationData = {
        bitsId: currentStudent.bitsId,
        amount,
        paymentMode,
        timestamp: new Date().toISOString(),
        volunteerEmail: user.email || 'unknown',
        volunteerName: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Unknown'
      };
      
      const { error } = await supabase
        .from('donations')
        .insert(donationData);
      
      if (error) throw error;
      setStep('success');
    } catch (err) {
      setError('Failed to record donation.');
      setOtpVerified(false); // Reset so they can retry if DB save fails
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setStep('lookup');
    setBitsId('');
    setCurrentStudent(null);
    setSearchResults([]);
    setAmount(null);
    setIsOtherAmount(false);
    setPaymentMode('upi');
    setError(null);
    setOtpDigits(Array(4).fill(''));
    setOtpLoading(false);
    setOtpError(null);
    setOtpSent(false);
    setOtpVerified(false);
    setResendCooldown(0);
  };

  // --- OTP helpers ---

  const startResendCooldown = () => {
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const sendDonorOtp = async () => {
    if (!currentStudent?.email) return;
    setOtpLoading(true);
    setOtpError(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-donor-otp', {
        body: { 
          email: currentStudent.email,
          name: currentStudent.name,
          amount: amount,
          paymentMode: paymentMode.toUpperCase()
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setOtpSent(true);
      startResendCooldown();
    } catch (err: any) {
      setOtpError(err.message || 'Failed to send OTP. Please try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleProceedToVerify = async () => {
    setOtpDigits(Array(4).fill(''));
    setOtpError(null);
    setOtpSent(false);
    setOtpVerified(false);
    setStep('verify');
    // Auto-send OTP when entering the verify step
    setTimeout(async () => {
      if (!currentStudent?.email) return;
      setOtpLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('send-donor-otp', {
          body: { 
            email: currentStudent.email,
            name: currentStudent.name,
            amount: amount,
            paymentMode: paymentMode.toUpperCase()
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setOtpSent(true);
        startResendCooldown();
      } catch (err: any) {
        setOtpError(err.message || 'Failed to send OTP. Please try again.');
      } finally {
        setOtpLoading(false);
      }
    }, 300);
  };

  const verifyDonorOtp = async () => {
    if (!currentStudent?.email) return;
    const otp = otpDigits.join('');
    if (otp.length !== 4) { setOtpError('Please enter all 4 digits.'); return; }
    setOtpLoading(true);
    setOtpError(null);
    try {
      const { data, error } = await supabase.functions.invoke('verify-donor-otp', {
        body: { email: currentStudent.email, otp },
      });
      if (error) throw error;
      if (data?.error) {
        setOtpError(data.error);
        if (data?.invalidated) setOtpDigits(Array(6).fill(''));
        return;
      }
      setOtpVerified(true);
      setTimeout(() => handleConfirmDonation(), 300);
    } catch (err: any) {
      setOtpError(err.message || 'Verification failed. Please try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleOtpInput = (index: number, value: string, refs: React.RefObject<HTMLInputElement>[]) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...otpDigits];
    newDigits[index] = value.slice(-1);
    setOtpDigits(newDigits);
    setOtpError(null);
    if (value && index < 5) refs[index + 1].current?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>, refs: React.RefObject<HTMLInputElement>[]) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      refs[index - 1].current?.focus();
    }
    if (e.key === 'Enter' && otpDigits.join('').length === 4) {
      verifyDonorOtp();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pasted.length === 4) {
      setOtpDigits(pasted.split(''));
    }
  };

  const exportData = async () => {
    setLoading(true);
    try {
      const donations = await fetchAllRecords('donations');
      const students = await fetchAllRecords('students');

      const donationsList = (donations as any[]).map(d => ({
        ...d,
        timestamp: new Date(d.timestamp).toLocaleString()
      }));
      
      const studentsList = students as Student[];
      const donorIds = new Set(donationsList.map(d => d.bitsId?.trim().toLowerCase()));
      const nonDonors = studentsList.filter(s => {
        const id = s.bitsId?.trim().toLowerCase();
        return id ? !donorIds.has(id) : false;
      });

      // Create workbook
      const wb = XLSX.utils.book_new();
      
      // Donors Sheet
      const donorsSheetData = donationsList.map(d => {
        const dId = d.bitsId?.trim().toLowerCase();
        const student = studentsList.find(s => s.bitsId?.trim().toLowerCase() === dId);
        return {
          'BITS ID': d.bitsId,
          'Name': student?.name || 'Unknown',
          'Amount': d.amount,
          'Mode': d.paymentMode,
          'Hostel': student?.hostel || '-',
          'Room': student?.roomNo || '-',
          'Email': student?.email || '-',
          'Recorded By': d.volunteerEmail,
          'Time': d.timestamp
        };
      });
      const wsDonors = XLSX.utils.json_to_sheet(donorsSheetData);
      XLSX.utils.book_append_sheet(wb, wsDonors, "Donors");

      // Non-Donors Sheet
      const wsNonDonors = XLSX.utils.json_to_sheet(nonDonors);
      XLSX.utils.book_append_sheet(wb, wsNonDonors, "Non-Donors");

      XLSX.writeFile(wb, `Fundraiser_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      setError('Failed to export data.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const seedMockData = async () => {
    setLoading(true);
    setError(null);
    try {
      const mockStudents: Student[] = [
        { bitsId: '2021A7PS0001', name: 'Rahul Sharma', hostel: 'Ram', roomNo: '101', email: 'f20210001@pilani.bits-pilani.ac.in' },
        { bitsId: '2021A7PS0002', name: 'Priya Patel', hostel: 'Meera', roomNo: '202', email: 'f20210002@pilani.bits-pilani.ac.in' },
        { bitsId: '2021A7PS0003', name: 'Amit Verma', hostel: 'Gandhi', roomNo: '303', email: 'f20210003@pilani.bits-pilani.ac.in' },
        { bitsId: '2021A7PS0004', name: 'Sneha Gupta', hostel: 'Meera', roomNo: '404', email: 'f20210004@pilani.bits-pilani.ac.in' },
        { bitsId: '2021A7PS0005', name: 'Vikram Singh', hostel: 'Krishna', roomNo: '505', email: 'f20210005@pilani.bits-pilani.ac.in' },
      ];

      const { error } = await supabase
        .from('students')
        .upsert(mockStudents);
      
      if (error) throw error;
      setSuccess('Mock student data seeded successfully!');
    } catch (err: any) {
      console.error(err);
      setError(`Failed to seed data: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const dataBuffer = evt.target?.result;
          const wb = XLSX.read(dataBuffer, { type: 'array' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data = XLSX.utils.sheet_to_json(ws) as any[];

          if (data.length === 0) {
            setError('The file appears to be empty.');
            return;
          }

          // Helper to find value by fuzzy key matching
          const getVal = (obj: any, possibleKeys: string[]) => {
            const keys = Object.keys(obj);
            for (const pk of possibleKeys) {
              const normalizedPk = pk.toLowerCase().replace(/[\s_]/g, '');
              const foundKey = keys.find(k => k.toLowerCase().replace(/[\s_]/g, '') === normalizedPk);
              if (foundKey) return obj[foundKey];
            }
            return '';
          };

          let count = 0;
          const studentsToUpsert: Student[] = [];
          for (const item of data) {
            const student: Student = {
              bitsId: String(getVal(item, ['bitsId', 'bits id', 'id', 'student id']) || '').trim().toUpperCase(),
              name: String(getVal(item, ['name', 'student name', 'full name']) || '').trim(),
              hostel: String(getVal(item, ['hostel', 'bh', 'hostel name']) || '').trim(),
              roomNo: String(getVal(item, ['roomNo', 'room', 'room number', 'room no']) || '').trim(),
              email: String(getVal(item, ['email', 'email id', 'college email']) || '').trim()
            };

            if (student.bitsId && student.name) {
              studentsToUpsert.push(student);
              count++;
            }
          }

          if (studentsToUpsert.length > 0) {
            const { error: upsertErr } = await supabase.from('students').upsert(studentsToUpsert);
            if (upsertErr) throw upsertErr;
          }

          if (count === 0) {
            setError('No valid student records found. Please check your column headers (bitsId, name, etc.).');
          } else {
            setSuccess(`Successfully uploaded ${count} students!`);
          }
        } catch (innerErr: any) {
          setError(`File processing error: ${innerErr.message}`);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err: any) {
      setError(`Upload failed: ${err.message}`);
    } finally {
      setLoading(false);
      // Reset input
      e.target.value = '';
    }
  };

  if (!isAuthReady || isDbReady === null) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
      </div>
    );
  }

  if (isDbReady === false) {
    return (
      <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-5 sm:p-8 rounded-3xl shadow-xl max-w-2xl w-full border border-stone-200"
        >
          <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mb-6">
            <Database className="w-8 h-8 text-amber-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 mb-4">Database Setup Required</h1>
          <p className="text-stone-600 mb-6">
            The application is connected to Supabase, but the required tables (<code className="bg-stone-100 px-1 rounded">students</code> and <code className="bg-stone-100 px-1 rounded">donations</code>) were not found.
          </p>
          
          <div className="bg-stone-900 rounded-2xl p-4 sm:p-6 mb-6 overflow-hidden">
            <div className="flex justify-between items-center mb-4">
              <span className="text-stone-400 text-xs font-mono uppercase tracking-widest">SQL Setup Script</span>
              <button 
                onClick={() => {
                  const sql = `-- Create Students table\ncreate table students (\n  "bitsId" text primary key,\n  "name" text not null,\n  "hostel" text,\n  "roomNo" text,\n  "email" text\n);\n\n-- Create Donations table\ncreate table donations (\n  id uuid default gen_random_uuid() primary key,\n  "bitsId" text references students("bitsId"),\n  "amount" numeric not null,\n  "paymentMode" text check ("paymentMode" in ('swd', 'upi')),\n  "timestamp" timestamptz default now(),\n  "volunteerEmail" text,\n  "volunteerName" text\n);\n\n-- Enable Realtime\nalter publication supabase_realtime add table donations;`;
                  navigator.clipboard.writeText(sql);
                  setSuccess('SQL copied to clipboard!');
                }}
                className="text-white text-xs bg-stone-800 px-3 py-1 rounded-lg hover:bg-stone-700 transition-colors"
              >
                Copy SQL
              </button>
            </div>
            <pre className="text-emerald-400 font-mono text-sm overflow-x-auto">
{`-- Create Students table
create table students (
  "bitsId" text primary key,
  "name" text not null,
  "hostel" text,
  "roomNo" text,
  "email" text
);

-- Create Donations table
create table donations (
  id uuid default gen_random_uuid() primary key,
  "bitsId" text references students("bitsId"),
  "amount" numeric not null,
  "paymentMode" text check ("paymentMode" in ('swd', 'upi')),
  "timestamp" timestamptz default now(),
  "volunteerEmail" text,
  "volunteerName" text
);

-- Enable Realtime
alter publication supabase_realtime add table donations;`}
            </pre>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-stone-500">
              1. Go to your <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="text-stone-900 underline font-medium">Supabase Dashboard</a>.
            </p>
            <p className="text-sm text-stone-500">
              2. Open the <strong>SQL Editor</strong> from the left sidebar.
            </p>
            <p className="text-sm text-stone-500">
              3. Paste the script above and click <strong>Run</strong>.
            </p>
            <p className="text-sm text-stone-500">
              4. Refresh this page once the tables are created.
            </p>
          </div>
          
          <button 
            onClick={() => window.location.reload()}
            className="mt-8 w-full py-4 bg-stone-900 text-white rounded-2xl font-medium hover:bg-stone-800 transition-colors"
          >
            I've run the script, refresh now
          </button>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center border border-stone-200"
        >
          <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <ShieldCheck className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-stone-900 mb-2">Fundraiser Portal</h1>
          <p className="text-stone-500 mb-8">Volunteer login required to record donations.</p>
          <button 
            onClick={handleLogin}
            className="w-full py-4 bg-stone-900 text-white rounded-2xl font-medium hover:bg-stone-800 transition-colors flex items-center justify-center gap-2"
          >
            Login with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans overscroll-x-none touch-pan-y">
      {/* Navigation */}
      <nav className="bg-white border-b border-stone-200 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between sticky top-0 z-50">
        <button 
          onClick={() => {
            // Need to determine how to go "home" without breaking state.
            // A simple page reload is safest, or firing window.location.href.
            window.location.reload();
          }}
          className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
        >
          <div className="w-10 h-10 bg-white border border-stone-200 shadow-sm rounded-xl flex items-center justify-center overflow-hidden shrink-0">
            <img src="/logo.jpg" alt="NSS Logo" className="w-8 h-8 object-contain" />
          </div>
          <div>
            <h2 className="font-serif font-bold text-lg leading-tight uppercase tracking-tight">UMANG COLLECTION</h2>
            <p className="hidden sm:block text-xs text-stone-400 uppercase tracking-widest font-medium">Volunteer Portal</p>
          </div>
        </button>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setStep('leaderboard')}
            className="p-2 text-stone-400 hover:text-stone-900 transition-colors"
            title="Leaderboard"
          >
            <Trophy className="w-6 h-6" />
          </button>
          {isAdmin && (
            <button
              onClick={() => setStep('admin')}
              className="p-2 text-stone-400 hover:text-stone-900 transition-colors"
              title="Admin Dashboard"
            >
              <ShieldCheck className="w-6 h-6" />
            </button>
          )}
          <div className="h-8 w-px bg-stone-200" />
          <div className="flex items-center gap-3">
            <img src={user.user_metadata?.avatar_url || ''} alt="" className="w-8 h-8 rounded-full border border-stone-200" />
            <button onClick={handleLogout} className="text-stone-400 hover:text-red-600">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto p-4 sm:p-6 pt-8 sm:pt-12">
        <AnimatePresence mode="wait">
          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 text-red-700"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </motion.div>
          )}

          {success && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex items-center gap-3 text-emerald-700"
            >
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-medium">{success}</p>
            </motion.div>
          )}

          {step === 'lookup' && (
            <motion.div 
              key="lookup"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="text-center space-y-2">
                <h1 className="text-3xl sm:text-4xl font-serif font-bold">Find Student</h1>
                <p className="text-stone-500">Enter BITS ID to fetch details</p>
              </div>
              <form onSubmit={handleLookup} className="relative">
                <input 
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="e.g. 0869"
                  value={bitsId}
                  onChange={(e) => setBitsId(e.target.value.toUpperCase())}
                  className="w-full p-4 sm:p-6 bg-white border border-stone-200 rounded-3xl text-lg sm:text-xl font-mono focus:outline-none focus:ring-2 focus:ring-stone-900 transition-all shadow-sm uppercase placeholder:normal-case"
                  autoFocus
                />
                <button 
                  type="submit"
                  disabled={loading || !bitsId}
                  className="absolute right-3 top-3 bottom-3 px-4 sm:px-6 bg-stone-900 text-white rounded-2xl hover:bg-stone-800 disabled:opacity-50 transition-all flex items-center gap-2"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                  <span className="hidden sm:inline">Search</span>
                </button>
              </form>

              {searchResults.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 space-y-3"
                >
                  <p className="text-xs font-bold text-stone-400 uppercase tracking-widest px-2">Multiple Matches ({searchResults.length})</p>
                  <div className="space-y-2 max-h-[60vh] sm:max-h-[70vh] overflow-y-auto pr-1">
                    {searchResults.map(student => (
                      <button
                        key={student.bitsId}
                        onClick={() => {
                          setCurrentStudent(student);
                          setSearchResults([]);
                          setStep('confirm');
                        }}
                        className="w-full p-4 bg-white border border-stone-200 rounded-2xl hover:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900 transition-all text-left flex flex-col sm:flex-row justify-between sm:items-center gap-2 group"
                      >
                        <div>
                          <p className="font-bold text-stone-900 group-hover:text-stone-600 transition-colors">{student.name}</p>
                          <p className="text-xs text-stone-500 font-mono mt-0.5">{student.bitsId}</p>
                        </div>
                        <div className="text-xs text-stone-500 font-medium px-2.5 py-1.5 bg-stone-100 rounded-lg self-start sm:self-auto shrink-0">
                          {student.hostel} {student.roomNo && `• ${student.roomNo}`}
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {step === 'confirm' && currentStudent && (
            <motion.div 
              key="confirm"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="text-center space-y-2">
                <h1 className="text-3xl sm:text-4xl font-serif font-bold">Confirm Details</h1>
                <p className="text-stone-500">Verify student information</p>
              </div>
              
              <div className="bg-white border border-stone-200 rounded-3xl p-5 sm:p-8 shadow-sm space-y-6">
                <div className="flex items-start gap-4 sm:gap-6">
                  <div className="w-16 h-16 bg-stone-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <UserIcon className="w-8 h-8 text-stone-400" />
                  </div>
                  <div className="space-y-1 flex-1">
                    {editingField === 'name' ? (
                      <input 
                        type="text"
                        defaultValue={currentStudent.name}
                        onBlur={(e) => {
                          updateStudentField('name', e.target.value);
                          setEditingField(null);
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        className="text-xl sm:text-2xl font-bold bg-stone-50 border border-stone-900/20 rounded-xl px-3 py-1 w-full focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                        autoFocus
                      />
                    ) : (
                      <div className="flex items-center flex-wrap gap-2 group">
                        <h3 className="text-xl sm:text-2xl font-bold">{currentStudent.name}</h3>
                        <button onClick={() => setEditingField('name')} className="p-2 bg-stone-100 rounded-full text-stone-500 hover:text-stone-900 hover:bg-stone-200 transition-all shrink-0">
                          <Pencil className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                      </div>
                    )}
                      <div className="flex items-center gap-3 mt-1">
                        <p className="text-stone-500 font-mono">{currentStudent.bitsId}</p>
                      </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-6 pt-6 border-t border-stone-100">
                  <div>
                    <label className="text-[10px] uppercase tracking-widest font-bold text-stone-400 block mb-1">Hostel</label>
                    <div className="flex items-center gap-3">
                      <p className="font-medium">{currentStudent.hostel}</p>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest font-bold text-stone-400 block mb-1">Room No</label>
                    <div className="flex items-center gap-3">
                      <p className="font-medium">{currentStudent.roomNo}</p>
                    </div>
                  </div>
                </div>
                <div className="pt-4 border-t border-stone-100">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-stone-400 block mb-1">Email ID</label>
                  {editingField === 'email' ? (
                    <input 
                      type="email"
                      defaultValue={currentStudent.email}
                      onBlur={(e) => {
                        updateStudentField('email', e.target.value);
                        setEditingField(null);
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                      className="font-medium bg-stone-50 border border-stone-900/20 rounded-lg px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                      autoFocus
                    />
                  ) : (
                    <div className="flex justify-between items-center gap-3">
                      <p className="font-medium truncate flex-1 min-w-0">{currentStudent.email}</p>
                      <button onClick={() => setEditingField('email')} className="p-2 bg-stone-100 rounded-full text-stone-500 hover:text-stone-900 hover:bg-stone-200 transition-all shrink-0">
                        <Pencil className="w-3 h-3 sm:w-4 sm:h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setStep('lookup')}
                  className="flex-1 py-4 border border-stone-200 rounded-2xl font-medium hover:bg-stone-100 transition-colors"
                >
                  Back
                </button>
                <button 
                  id="confirm-next-btn"
                  onClick={() => setStep('amount')}
                  className="flex-[2] py-4 bg-stone-900 text-white rounded-2xl font-medium hover:bg-stone-800 transition-colors flex items-center justify-center gap-2"
                >
                  Proceed to Amount
                </button>
              </div>
            </motion.div>
          )}

          {step === 'verify' && currentStudent && (() => {
            // Create refs inside render via closure — stable per render
            const otpRefs = Array.from({ length: 4 }, () => React.createRef<HTMLInputElement>());
            const maskedEmail = currentStudent.email.replace(/^(.{2})(.+)(@.+)$/, (_, a, _b, c) => a + '****' + c);
            return (
              <motion.div
                key="verify"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="text-center space-y-2">
                  <h1 className="text-3xl sm:text-4xl font-serif font-bold">Verify Donor</h1>
                  <p className="text-stone-500">
                    {otpSent
                      ? <>Code sent to <span className="font-medium text-stone-700">{maskedEmail}</span></>
                      : 'Sending verification code…'}
                  </p>
                </div>

                <div className="bg-white border border-stone-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
                  {/* 4-digit OTP boxes */}
                  <div className="flex gap-2 sm:gap-3 justify-center" onPaste={handleOtpPaste}>
                    {otpDigits.map((digit, i) => (
                      <input
                        key={i}
                        id={`otp-${i}`}
                        ref={otpRefs[i]}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        value={digit}
                        disabled={otpLoading || otpVerified}
                        onChange={(e) => handleOtpInput(i, e.target.value, otpRefs)}
                        onKeyDown={(e) => handleOtpKeyDown(i, e, otpRefs)}
                        onFocus={(e) => e.target.select()}
                        autoFocus={i === 0}
                        className={cn(
                          "w-11 h-14 sm:w-14 sm:h-16 text-center text-2xl font-bold rounded-2xl border-2 transition-all focus:outline-none",
                          otpVerified
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : otpError
                            ? "border-red-300 bg-red-50 text-red-700"
                            : digit
                            ? "border-stone-900 bg-stone-50 text-stone-900"
                            : "border-stone-200 bg-white text-stone-900 focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10"
                        )}
                      />
                    ))}
                  </div>

                  {/* Status messages */}
                  <AnimatePresence mode="wait">
                    {otpVerified && (
                      <motion.div
                        key="verified"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex items-center justify-center gap-2 text-emerald-600 font-semibold"
                      >
                        <CheckCircle className="w-5 h-5" /> Verified! Proceeding…
                      </motion.div>
                    )}
                    {otpError && !otpVerified && (
                      <motion.div
                        key="otp-error"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center justify-center gap-2 text-red-600 text-sm font-medium"
                      >
                        <AlertCircle className="w-4 h-4 flex-shrink-0" /> {otpError}
                      </motion.div>
                    )}
                    {otpLoading && !otpVerified && (
                      <motion.div
                        key="otp-loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center justify-center gap-2 text-stone-400 text-sm"
                      >
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {otpSent ? 'Verifying…' : 'Sending code…'}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Verify button */}
                  <button
                    id="verify-next-btn"
                    onClick={verifyDonorOtp}
                    disabled={otpDigits.join('').length !== 4 || otpLoading || otpVerified}
                    className="w-full py-4 bg-stone-900 text-white rounded-2xl font-medium hover:bg-stone-800 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
                  >
                    {otpLoading && otpSent ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                    Verify Code
                  </button>

                  {/* Resend */}
                  <div className="text-center">
                    <button
                      onClick={sendDonorOtp}
                      disabled={resendCooldown > 0 || otpLoading || otpVerified}
                      className="inline-flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-900 disabled:opacity-40 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => setStep('amount')}
                  className="w-full py-4 border border-stone-200 rounded-2xl font-medium hover:bg-stone-100 transition-colors"
                >
                  Back
                </button>
              </motion.div>
            );
          })()}

          {step === 'amount' && (
            <motion.div 
              key="amount"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4 sm:space-y-8"
            >
              <div className="text-center space-y-1 sm:space-y-2">
                <h1 className="text-2xl sm:text-4xl font-serif font-bold">Donation Amount</h1>
                <p className="text-stone-500 text-sm sm:text-base">Select amount and payment mode</p>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                {[365, 500, 750, 1000, 1500, 2100, 3100, 5100].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => { setAmount(amt); setIsOtherAmount(false); }}
                    className={cn(
                      "py-3 sm:py-6 rounded-xl sm:rounded-2xl border-2 transition-all text-base sm:text-xl font-bold tracking-tight",
                      amount === amt && !isOtherAmount
                        ? "border-stone-900 bg-stone-900 text-white shadow-lg scale-[1.02]" 
                        : "border-stone-200 bg-white text-stone-600 hover:border-stone-400"
                    )}
                  >
                    ₹{amt}
                  </button>
                ))}
                <button
                  onClick={() => { setIsOtherAmount(true); setAmount(null); }}
                  className={cn(
                    "py-3 sm:py-6 rounded-xl sm:rounded-2xl border-2 transition-all text-base sm:text-xl font-bold tracking-tight",
                    isOtherAmount
                      ? "border-stone-900 bg-stone-900 text-white shadow-lg scale-[1.02]" 
                      : "border-stone-200 bg-white text-stone-600 hover:border-stone-400"
                  )}
                >
                  Other
                </button>
              </div>

              <AnimatePresence mode="wait">
                {isOtherAmount && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="pt-2"
                  >
                    <label className="text-[10px] uppercase tracking-widest font-bold text-stone-400 block mb-2">Custom Amount (₹)</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      min="1"
                      placeholder="Enter amount..."
                      value={amount || ''}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setAmount(val > 0 ? val : null);
                      }}
                      className="w-full py-4 px-5 bg-white border border-stone-200 rounded-2xl text-xl font-bold focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-stone-900 transition-all font-mono"
                      autoFocus
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-2 sm:space-y-4 pt-0 sm:pt-2">
                <label className="text-[10px] uppercase tracking-widest font-bold text-stone-400 block">Payment Mode</label>
                <div className="grid grid-cols-2 gap-2 sm:gap-4">
                  <button
                    onClick={() => setPaymentMode('upi')}
                    className={cn(
                      "py-3 sm:py-4 rounded-xl sm:rounded-2xl border-2 flex items-center justify-center gap-2 font-bold transition-all",
                      paymentMode === 'upi'
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-stone-200 bg-white text-stone-400"
                    )}
                  >
                    <CreditCard className="w-4 h-4 sm:w-5 sm:h-5" />
                    UPI
                  </button>
                  <button
                    onClick={() => setPaymentMode('swd')}
                    className={cn(
                      "py-3 sm:py-4 rounded-xl sm:rounded-2xl border-2 flex items-center justify-center gap-2 font-bold transition-all",
                      paymentMode === 'swd'
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-stone-200 bg-white text-stone-400"
                    )}
                  >
                    <Database className="w-4 h-4 sm:w-5 sm:h-5" />
                    SWD
                  </button>
                </div>
              </div>

              <div className="flex gap-2 sm:gap-4 pt-2 sm:pt-4">
                <button 
                  onClick={() => setStep('confirm')}
                  className="flex-1 py-3 sm:py-4 border border-stone-200 rounded-xl sm:rounded-2xl font-medium hover:bg-stone-100 transition-colors"
                >
                  Back
                </button>
                <button 
                  id="amount-next-btn"
                  disabled={!amount || amount < 1}
                  onClick={handleProceedToVerify}
                  className="flex-[2] py-3 sm:py-4 bg-stone-900 text-white rounded-xl sm:rounded-2xl font-medium hover:bg-stone-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  <Mail className="w-4 h-4 sm:w-5 sm:h-5" />
                  Verify Donor
                </button>
              </div>
            </motion.div>
          )}

          {step === 'success' && (
            <motion.div 
              key="success"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center space-y-8 py-8 sm:py-12"
            >
              <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-12 h-12 text-emerald-600" />
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl sm:text-4xl font-serif font-bold">Donation Recorded!</h1>
                <p className="text-stone-500">The donation has been successfully logged.</p>
              </div>
              <div className="bg-white border border-stone-200 rounded-3xl p-6 max-w-sm mx-auto">
                <p className="text-sm text-stone-400 uppercase tracking-widest font-bold mb-2">Receipt Summary</p>
                <p className="text-3xl font-bold">₹{amount}</p>
                <p className="text-stone-500 font-medium">{currentStudent?.name}</p>
                <p className="text-xs text-stone-400 font-mono mt-2">{currentStudent?.bitsId}</p>
              </div>
              <button 
                onClick={resetForm}
                className="w-full max-w-sm py-4 bg-stone-900 text-white rounded-2xl font-medium hover:bg-stone-800 transition-colors"
              >
                New Donation
              </button>
            </motion.div>
          )}

          {step === 'admin' && isAdmin && (
            <motion.div 
              key="admin"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="space-y-8"
            >
              <div className="flex items-start sm:items-center justify-between">
                <div className="space-y-1">
                  <h1 className="text-2xl sm:text-3xl font-serif font-bold">Admin Panel</h1>
                  <p className="text-stone-500">Manage data and generate reports</p>
                </div>
                <button 
                  onClick={() => setStep('lookup')}
                  className="p-2 text-stone-400 hover:text-stone-900"
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-1 gap-6">
                {/* Stats Section */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-stone-400 mb-1">Total Collection</p>
                    <h2 className="text-3xl font-bold text-stone-900">₹{stats.total.toLocaleString()}</h2>
                    <div className="mt-4 flex gap-4 text-xs font-medium">
                      <div className="flex items-center gap-1.5 text-emerald-600">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        UPI: ₹{stats.upi.toLocaleString()}
                      </div>
                      <div className="flex items-center gap-1.5 text-indigo-600">
                        <div className="w-2 h-2 rounded-full bg-indigo-500" />
                        SWD: ₹{stats.swd.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm flex flex-col justify-center">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-stone-400 mb-1">Total Donors</p>
                    <h2 className="text-3xl font-bold text-stone-900">{stats.donorCount}</h2>
                    <p className="text-xs text-stone-500 mt-2">Unique BITS IDs</p>
                  </div>
                  <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm flex flex-col justify-center">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-stone-400 mb-1">Avg. Donation</p>
                    <h2 className="text-3xl font-bold text-stone-900">
                      ₹{stats.donorCount > 0 ? Math.round(stats.total / stats.donorCount).toLocaleString() : 0}
                    </h2>
                    <p className="text-xs text-stone-500 mt-2">Per donor</p>
                  </div>
                </div>

                <div className="bg-white border border-stone-200 rounded-3xl p-8 space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                      <Download className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">Export Excel Report</h3>
                      <p className="text-sm text-stone-500">Download donor and non-donor lists</p>
                    </div>
                  </div>
                  <button 
                    onClick={exportData}
                    disabled={loading}
                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                    Generate Excel Sheet
                  </button>
                </div>


              </div>
            </motion.div>
          )}

          {step === 'leaderboard' && (
            <motion.div 
              key="leaderboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="space-y-8"
            >
              <div className="flex items-start sm:items-center justify-between">
                <div className="space-y-1">
                  <h1 className="text-2xl sm:text-3xl font-serif font-bold">Leaderboard</h1>
                  <p className="text-stone-500">Top hostels and volunteers by number of donations</p>
                </div>
                <button 
                  onClick={() => setStep('lookup')}
                  className="p-2 text-stone-400 hover:text-stone-900"
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Hostels Leaderboard */}
                <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                      <Trophy className="w-5 h-5 text-amber-600" />
                    </div>
                    <h2 className="text-xl font-bold">Top 5 Hostels</h2>
                  </div>
                  <div className="space-y-4">
                    {hostelLeaderboard.length === 0 ? (
                      <p className="text-sm text-stone-500 text-center py-4">No data yet</p>
                    ) : (
                      hostelLeaderboard.map((h, i) => (
                        <div key={h.hostel} className="flex items-center justify-between p-3 rounded-2xl bg-stone-50 hover:bg-stone-100 transition-colors border border-transparent hover:border-stone-200">
                          <div className="flex items-center gap-3">
                            <span className="w-6 text-center font-bold text-stone-400 text-lg">
                              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                            </span>
                            <span className="font-bold text-stone-900">{h.hostel}</span>
                          </div>
                          <div className="px-3 py-1.5 bg-white rounded-lg border border-stone-200 text-sm font-bold shadow-sm">
                            {h.count} <span className="text-[10px] text-stone-400 uppercase tracking-widest font-bold ml-1">dn</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Volunteers Leaderboard */}
                <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                      <UserIcon className="w-5 h-5 text-indigo-600" />
                    </div>
                    <h2 className="text-xl font-bold">Top 5 Volunteers</h2>
                  </div>
                  <div className="space-y-4">
                    {volunteerLeaderboard.length === 0 ? (
                      <p className="text-sm text-stone-500 text-center py-4">No data yet</p>
                    ) : (
                      volunteerLeaderboard.map((v, i) => (
                        <div key={v.email} className="flex items-center justify-between p-3 rounded-2xl bg-stone-50 hover:bg-stone-100 transition-colors border border-transparent hover:border-stone-200">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-6 text-center font-bold text-stone-400 text-lg shrink-0">
                              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                            </span>
                            <div className="flex flex-col min-w-0">
                              <span className="font-bold text-stone-900 truncate" title={v.name}>{v.name}</span>
                            </div>
                          </div>
                          <div className="px-3 py-1.5 bg-white rounded-lg border border-stone-200 text-sm font-bold shadow-sm shrink-0 ml-2">
                            {v.count} <span className="text-[10px] text-stone-400 uppercase tracking-widest font-bold ml-1">dn</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
