<script>
  import { onMount } from 'svelte';
  import ChecklistView from './ChecklistView.svelte';

  let checklistId = '';
  let checklist = null;
  let loading = true;
  let error = '';

  onMount(async () => {
    console.log('App mounted');
    const params = new URLSearchParams(window.location.search);
    checklistId = params.get('checklist');
    console.log('Checklist ID:', checklistId);

    if (!checklistId) {
      console.log('No checklist ID, showing welcome');
      loading = false;
      return;
    }

    try {
      console.log('Fetching checklist...');
      const response = await fetch(`/api/checklist/${checklistId}`);
      console.log('Response status:', response.status);
      if (!response.ok) throw new Error('Checklist not found');
      checklist = await response.json();
      console.log('Checklist loaded:', checklist);
    } catch (err) {
      console.error('Error loading checklist:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  });

</script>

{#if loading}
  <div class="container">
    <div class="loader">Loading...</div>
  </div>
{:else if !checklistId}
  <div class="container">
    <div class="welcome">
      <h1>📦 Walmart Item Check</h1>
      <p>No checklist loaded yet.</p>
      <p>Use the userscript on a Walmart order page to create one!</p>
    </div>
  </div>
{:else if error}
  <div class="container">
    <div class="error">
      <h2>❌ Error</h2>
      <p>{error}</p>
    </div>
  </div>
{:else if checklist}
  <ChecklistView {checklist} {checklistId} />
{/if}

<style global>
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }

  .container {
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .loader, .welcome, .error {
    background: white;
    padding: 40px;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    text-align: center;
    width: 100%;
  }

  .loader {
    font-size: 18px;
    color: #667eea;
  }

  .welcome h1, .error h2 {
    color: #667eea;
    margin-bottom: 20px;
  }

  .welcome p, .error p {
    color: #666;
    line-height: 1.6;
    margin: 10px 0;
  }

  @media (max-width: 480px) {
    .container {
      padding: 16px;
    }

    .loader, .welcome, .error {
      padding: 24px;
    }
  }
</style>
