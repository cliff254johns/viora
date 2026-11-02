// ==========================================
// MAMA MBOGA GROCERY MANAGEMENT SYSTEM
// firebase.js — Shared Firebase SDK & Helpers
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    createUserWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    getDoc, 
    setDoc, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    getDocs, 
    onSnapshot,
    serverTimestamp,
    increment,
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    getStorage, 
    ref, 
    uploadBytes, 
    getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// --- FIREBASE CONFIGURATION SECTION ---
// Live Firebase credentials configured for project mama-mboga-79642
const firebaseConfig = {
    apiKey: "AIzaSyAz1xjzDXmJE1CRwnifGiPWULDhstyvgcE",
    authDomain: "mama-mboga-79642.firebaseapp.com",
    projectId: "mama-mboga-79642",
    storageBucket: "mama-mboga-79642.firebasestorage.app",
    messagingSenderId: "105406305967",
    appId: "1:105406305967:web:0c8e80085378b4e95f665a",
    measurementId: "G-3TFV717EYB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Re-export standard auth and firestore utility functions for shared modules
export { 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged, 
    createUserWithEmailAndPassword,
    collection, 
    doc, 
    getDoc, 
    setDoc, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    getDocs, 
    onSnapshot, 
    serverTimestamp, 
    increment, 
    runTransaction,
    ref,
    uploadBytes,
    getDownloadURL
};

// --- COMMON HELPER FUNCTIONS ---

/**
 * Deduct stock from a product after a sale (transaction-safe)
 */
export async function deductStock(uid, productId, qty) {
    const prodRef = doc(db, `users/${uid}/products`, productId);
    return runTransaction(db, async (tx) => {
        const snap = await tx.get(prodRef);
        if (!snap.exists()) return { ok: false, reason: 'missing' };
        const current = snap.data().stock || 0;
        if (current < qty) return { ok: false, reason: 'insufficient', available: current };
        tx.update(prodRef, { stock: current - qty });
        return { ok: true, remaining: current - qty };
    });
}

/**
 * Format currency in Kenyan Shillings (KES)
 */
export function formatKES(amount) {
    return new Intl.NumberFormat('en-KE', { 
        style: 'currency', 
        currency: 'KES',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(amount || 0);
}

/**
 * Generate a unique receipt or order number
 */
export function generateCode(prefix = 'MM') {
    const timestamp = Date.now().toString().slice(-6);
    const randomNum = Math.floor(100 + Math.random() * 900);
    return `${prefix}-${timestamp}-${randomNum}`;
}

/**
 * Show toast notification helper
 */
export function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position: fixed; top: 16px; right: 16px; z-index: 9999; display: flex; flex-direction: column; gap: 10px; max-width: 90vw;';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? '#16a34a' : type === 'error' ? '#ef4444' : '#f59e0b';
    toast.style.cssText = `background: ${bgColor}; color: white; padding: 12px 20px; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.2); font-family: sans-serif; font-size: 14px; font-weight: 600; transition: all 0.3s ease; transform: translateY(-10px); opacity: 0;`;
    toast.textContent = message;
    container.appendChild(toast);
    
    requestAnimationFrame(() => {
        toast.style.transform = 'translateY(0)';
        toast.style.opacity = '1';
    });
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

/**
 * Upload image to Firebase Storage with compression/fallback
 */
export async function uploadImage(file, path) {
    if (!file) return null;
    const storageRef = ref(storage, `${path}/${Date.now()}_${file.name}`);
    const snapshot = await uploadBytes(storageRef, file);
    return await getDownloadURL(snapshot.ref);
}

/**
 * Fetch the current user's role document (defaults to 'owner')
 */
export async function getUserRole(uid) {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? (snap.data().role || 'owner') : 'owner';
}

// Register PWA Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW registration failed:', err));
    });
}
export async function isPlatformAdmin(user) {
    if (!user) return false;
    const token = await user.getIdTokenResult();
    return token.claims.platformAdmin === true;
}
