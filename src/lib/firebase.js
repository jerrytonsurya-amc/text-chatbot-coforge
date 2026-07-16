import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

const THREADS = 'threads';

export function subscribeToThreads(callback) {
  const q = query(collection(db, THREADS), orderBy('updatedAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const threads = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    callback(threads);
  });
}

export function subscribeToMessages(threadId, callback) {
  const q = query(
    collection(db, THREADS, threadId, 'messages'),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    callback(messages);
  });
}

export async function createThread(title = 'New chat') {
  const ref = await addDoc(collection(db, THREADS), {
    title,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateThreadTitle(threadId, title) {
  await updateDoc(doc(db, THREADS, threadId), {
    title,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteThread(threadId) {
  const messagesRef = collection(db, THREADS, threadId, 'messages');
  const messagesSnap = await getDocs(messagesRef);
  const batch = writeBatch(db);
  messagesSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, THREADS, threadId));
  await batch.commit();
}

export async function addMessage(threadId, role, content, sources = []) {
  const msgRef = await addDoc(collection(db, THREADS, threadId, 'messages'), {
    role,
    content,
    sources,
    createdAt: serverTimestamp(),
  });

  await updateDoc(doc(db, THREADS, threadId), {
    updatedAt: serverTimestamp(),
  });

  return msgRef.id;
}
