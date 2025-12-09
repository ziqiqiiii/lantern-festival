// Audio management for Lantern Festival
(() => {
  // Audio elements
  const audioElements = {
    background: null,
    airWoosh: null
  };

  // Audio sources
  const audioSources = {
    background: '/audio/mid-autumn-festival.mp3', // Local path first
    airWoosh: '/audio/air_woosh.wav' // Local path first
  };

  // Fallback URLs
  const fallbackUrls = {
    background: 'https://assets.mixkit.co/music/preview/mixkit-game-show-suspense-waiting-667.mp3',
    airWoosh: 'https://assets.mixkit.co/sfx/preview/mixkit-fast-small-swoosh-1028.mp3'
  };

  // Audio state
  const audioState = {
    backgroundPlaying: true,
    muted: false
  };

  // Initialize audio elements
  function initAudio() {
    console.log('Initializing audio elements');
    // Create background audio
    audioElements.background = new Audio();
    audioElements.background.loop = true;
    audioElements.background.volume = 0.3;
    
    // Create air woosh sound effect
    audioElements.airWoosh = new Audio();
    audioElements.airWoosh.volume = 0.7;
    
    // Try to load local files first, fallback to external URLs
    loadAudioWithFallback(audioElements.background, audioSources.background, fallbackUrls.background);
    loadAudioWithFallback(audioElements.airWoosh, audioSources.airWoosh, fallbackUrls.airWoosh);
    
    console.log('Audio elements initialized');
  }

  // Load audio with fallback
  function loadAudioWithFallback(audioElement, localPath, fallbackUrl) {
    // First try local path
    audioElement.src = localPath;
    
    // Set up error handling to fallback
    audioElement.addEventListener('error', () => {
      console.warn(`Failed to load ${localPath}, falling back to ${fallbackUrl}`);
      audioElement.src = fallbackUrl;
    });
  }

  // Play background music
  function playBackgroundMusic() {
    console.log('Attempting to play background music');
    if (!audioElements.background) {
      console.log('No background audio element found');
      return;
    }
    
    if (audioState.muted) {
      console.log('Audio is muted, not playing');
      audioElements.background.muted = true;
      return;
    }
    
    console.log('Playing background music');
    audioElements.background.play().then(() => {
      console.log('Background music playing successfully');
    }).catch(e => {
      console.warn('Failed to play background music:', e);
    });
    
    audioState.backgroundPlaying = true;
  }

  // Pause background music
  function pauseBackgroundMusic() {
    console.log('Pausing background music');
    if (!audioElements.background) {
      console.log('No background audio element found');
      return;
    }
    
    audioElements.background.pause();
    audioState.backgroundPlaying = false;
    console.log('Background music paused');
  }

  // Toggle background music
  function toggleBackgroundMusic() {
    console.log('Toggling background music. Current state:', audioState.backgroundPlaying);
    if (audioState.backgroundPlaying) {
      pauseBackgroundMusic();
    } else {
      playBackgroundMusic();
    }
    
    console.log('New state:', audioState.backgroundPlaying);
    return audioState.backgroundPlaying;
  }

  // Play air woosh sound effect
  function playAirWoosh() {
    if (!audioElements.airWoosh) return;
    
    // Reset to start in case it's still playing
    audioElements.airWoosh.currentTime = 0;
    
    audioElements.airWoosh.play().catch(e => {
      console.warn('Failed to play air woosh sound:', e);
    });
  }

  // Toggle mute
  function toggleMute() {
    audioState.muted = !audioState.muted;
    
    if (audioElements.background) {
      audioElements.background.muted = audioState.muted;
    }
    
    if (audioElements.airWoosh) {
      audioElements.airWoosh.muted = audioState.muted;
    }
    
    return audioState.muted;
  }

  // Set volume for background music
  function setBackgroundVolume(volume) {
    if (audioElements.background) {
      audioElements.background.volume = Math.max(0, Math.min(1, volume));
    }
  }

  // Set volume for sound effects
  function setSFXVolume(volume) {
    if (audioElements.airWoosh) {
      audioElements.airWoosh.volume = Math.max(0, Math.min(1, volume));
    }
  }

  // Initialize when DOM is loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAudio);
  } else {
    initAudio();
  }
  
  // Try to play background music automatically when audio is initialized
  document.addEventListener('DOMContentLoaded', () => {
    // Small delay to ensure everything is loaded
    setTimeout(() => {
      if (window.LanternAudio && !audioState.muted) {
        // Try to play background music
        window.LanternAudio.playBackgroundMusic();
        
        // Also try to play after first user interaction to comply with browser policies
        document.body.addEventListener('click', function playOnFirstInteraction() {
          if (window.LanternAudio && !audioState.muted && !audioState.backgroundPlaying) {
            window.LanternAudio.playBackgroundMusic();
          }
          // Remove the event listener after first interaction
          document.body.removeEventListener('click', playOnFirstInteraction);
        }, { once: true });
      }
      

    }, 500);
  });

  // Expose API to global scope
  window.LanternAudio = {
    playBackgroundMusic,
    pauseBackgroundMusic,
    toggleBackgroundMusic,
    playAirWoosh,
    toggleMute,
    setBackgroundVolume,
    setSFXVolume,
    getState: () => ({ ...audioState })
  };
})();