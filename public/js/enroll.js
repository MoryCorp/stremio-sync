import { apiPublic, toast, withLoading, validateForm } from './utils.js';

const form = document.getElementById('enrollForm');
const btn = document.getElementById('submitBtn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!validateForm(form, {
    email: { required: true, email: true },
    password: { required: true },
  })) return;

  await withLoading(btn, async () => {
    try {
      const res = await apiPublic('enroll', {
        method: 'POST',
        body: JSON.stringify({
          email: form.email.value.trim(),
          password: form.password.value,
        }),
      });
      toast.success('Account connected! You will receive addon updates automatically.');
      form.reset();
    } catch (err) {
      if (err.message.includes('already enrolled')) {
        toast.warning('This account is already enrolled.');
      } else {
        toast.error(err.message || 'Connection failed');
      }
    }
  });
});
