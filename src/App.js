import { useEffect, useRef, useState } from 'react';
import { HashRouter, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

const FAVORITES_STORAGE_KEY = 'soundshelf-favorites';
const RECENT_SEARCHES_STORAGE_KEY = 'soundshelf-recent-searches';
const BLOCKED_TITLE_WORDS = ['tribute', 'karaoke', 'instrumental', 'interview', 'live', 'commentary', 'cover'];

const QUICK_SEARCHES = ['Frank Ocean', 'Nirvana', 'Daft Punk', 'Sade', 'Kendrick Lamar'];
const TRENDING_ARTISTS = ['Solange', 'Massive Attack', 'Tyler, the Creator', 'Pharcyde', 'A Tribe Called Quest', 'PJ Harvey'];

const genreGradients = {
  Pop: 'linear-gradient(135deg, #b45309, #f97316)',
  Rock: 'linear-gradient(135deg, #1f2937, #b91c1c)',
  'Hip-Hop': 'linear-gradient(135deg, #111827, #d97706)',
  'R&B': 'linear-gradient(135deg, #164e63, #0f766e)',
  Jazz: 'linear-gradient(135deg, #1d4ed8, #0f766e)',
  Electronic: 'linear-gradient(135deg, #4338ca, #0f766e)',
};

const genreColors = {
  Pop: { bg: 'rgba(249, 115, 22, 0.14)', color: '#fdba74', border: 'rgba(249, 115, 22, 0.35)' },
  Rock: { bg: 'rgba(248, 113, 113, 0.14)', color: '#fca5a5', border: 'rgba(248, 113, 113, 0.35)' },
  'Hip-Hop': { bg: 'rgba(251, 191, 36, 0.14)', color: '#fde68a', border: 'rgba(251, 191, 36, 0.35)' },
  'R&B': { bg: 'rgba(45, 212, 191, 0.14)', color: '#99f6e4', border: 'rgba(45, 212, 191, 0.35)' },
  Jazz: { bg: 'rgba(96, 165, 250, 0.14)', color: '#bfdbfe', border: 'rgba(96, 165, 250, 0.35)' },
  Electronic: { bg: 'rgba(129, 140, 248, 0.14)', color: '#c7d2fe', border: 'rgba(129, 140, 248, 0.35)' },
};

function normalizeText(value) {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function mapGenre(itunesGenre) {
  const genre = (itunesGenre || '').toLowerCase();

  if (genre.includes('hip') || genre.includes('rap')) return 'Hip-Hop';
  if (genre.includes('r&b') || genre.includes('soul')) return 'R&B';
  if (genre.includes('jazz')) return 'Jazz';
  if (genre.includes('electronic') || genre.includes('dance') || genre.includes('techno')) return 'Electronic';
  if (genre.includes('rock') || genre.includes('alternative') || genre.includes('metal') || genre.includes('punk') || genre.includes('indie')) return 'Rock';

  return 'Pop';
}

function isBlockedTitle(title) {
  const cleanedTitle = normalizeText(title);
  return BLOCKED_TITLE_WORDS.some((word) => cleanedTitle.includes(word));
}

function mapItunesAlbum(result, id) {
  const year = Number.parseInt((result.releaseDate || '').slice(0, 4), 10) || null;
  const genre = mapGenre(result.primaryGenreName);
  const artwork = result.artworkUrl100 || result.artworkUrl60 || null;
  const title = result.collectionName || 'Unknown Album';
  const artist = result.artistName || 'Unknown Artist';
  const collectionId = String(result.collectionId || id);

  return {
    id,
    collectionId,
    title,
    artist,
    year,
    genre,
    tracks: result.trackCount || 0,
    price: result.collectionPrice ? `${result.collectionPrice} ${result.currency || 'USD'}` : 'Price unavailable',
    description: `${title} by ${artist}${year ? `, released in ${year}` : ''}.`,
    gradient: genreGradients[genre] || 'linear-gradient(135deg, #1f2937, #0f766e)',
    coverUrl: artwork ? artwork.replace(/\/\d+x\d+bb\.(jpg|png)/, '/600x600bb.$1') : null,
    itunesUrl:
      result.collectionViewUrl ||
      `https://music.apple.com/us/search?term=${encodeURIComponent(`${title} ${artist}`.trim())}`,
  };
}

function getDecade(year) {
  if (!year) return 'unknown';
  if (year < 1970) return '60s';
  if (year < 1980) return '70s';
  if (year < 1990) return '80s';
  if (year < 2000) return '90s';
  if (year < 2010) return '2000s';
  if (year < 2020) return '2010s';
  return '2020s';
}

function buildSearchUrl(query) {
  return `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&limit=36`;
}

function buildLookupUrl(albumId) {
  return `https://itunes.apple.com/lookup?id=${encodeURIComponent(albumId)}&entity=song`;
}

async function fetchWikipediaSummary(artist) {
  const directResponse = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(artist)}`);

  if (directResponse.ok) {
    const payload = await directResponse.json();

    if (payload.extract) {
      return {
        title: payload.title || artist,
        description: payload.description || 'Artist overview',
        extract: payload.extract,
        image: payload.thumbnail?.source || null,
        pageUrl: payload.content_urls?.desktop?.page || null,
      };
    }
  }

  const searchResponse = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`${artist} musician`)}&format=json&origin=*`
  );
  const searchPayload = await searchResponse.json();
  const firstResult = searchPayload.query?.search?.[0];

  if (!firstResult?.title) {
    return null;
  }

  const fallbackResponse = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstResult.title)}`
  );

  if (!fallbackResponse.ok) {
    return null;
  }

  const payload = await fallbackResponse.json();

  if (!payload.extract) {
    return null;
  }

  return {
    title: payload.title || firstResult.title,
    description: payload.description || 'Artist overview',
    extract: payload.extract,
    image: payload.thumbnail?.source || null,
    pageUrl: payload.content_urls?.desktop?.page || null,
  };
}

function App() {
  const [favorites, setFavorites] = useState(() => {
    try {
      const savedFavorites = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
      return savedFavorites ? JSON.parse(savedFavorites) : [];
    } catch (error) {
      return [];
    }
  });
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      const savedSearches = window.localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);
      return savedSearches ? JSON.parse(savedSearches) : QUICK_SEARCHES.slice(0, 4);
    } catch (error) {
      return QUICK_SEARCHES.slice(0, 4);
    }
  });

  useEffect(() => {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    window.localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(recentSearches));
  }, [recentSearches]);

  function toggleFavorite(album) {
    setFavorites((currentFavorites) => {
      const exists = currentFavorites.some((item) => item.collectionId === album.collectionId);

      if (exists) {
        return currentFavorites.filter((item) => item.collectionId !== album.collectionId);
      }

      return [album, ...currentFavorites].slice(0, 18);
    });
  }

  function rememberSearch(query) {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) return;

    setRecentSearches((currentSearches) => {
      const filtered = currentSearches.filter((item) => normalizeText(item) !== normalizeText(trimmedQuery));
      return [trimmedQuery, ...filtered].slice(0, 8);
    });
  }

  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppFrame
        favorites={favorites}
        recentSearches={recentSearches}
        onRememberSearch={rememberSearch}
        onToggleFavorite={toggleFavorite}
      />
    </HashRouter>
  );
}

function AppFrame({ favorites, recentSearches, onRememberSearch, onToggleFavorite }) {
  const location = useLocation();
  const firstLocationRef = useRef(true);
  const transitionTimerRef = useRef(null);
  const [routeTransition, setRouteTransition] = useState({ active: false, label: 'Opening page...' });

  useEffect(() => {
    if (firstLocationRef.current) {
      firstLocationRef.current = false;
      return undefined;
    }

    setRouteTransition((currentTransition) => ({
      active: true,
      label: currentTransition.label || 'Opening page...',
    }));

    window.clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = window.setTimeout(() => {
      setRouteTransition((currentTransition) => ({ ...currentTransition, active: false }));
    }, 520);

    return () => window.clearTimeout(transitionTimerRef.current);
  }, [location.pathname, location.search]);

  function beginRouteTransition(label) {
    setRouteTransition({ active: true, label });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink className="brand-link" to="/">
          <span className="brand-chip">SS</span>
          <span>
            <strong>SoundShelf</strong>
            <small>iTunes + Wikipedia</small>
          </span>
        </NavLink>

        <nav className="main-nav" aria-label="Main navigation">
          <NavLink to="/">Home</NavLink>
          <NavLink to="/search">Search</NavLink>
          <NavLink to="/library">Library</NavLink>
        </nav>
      </header>

      <Routes>
        <Route
          path="/"
          element={<HomePage recentSearches={recentSearches} onRememberSearch={onRememberSearch} onBeginRouteTransition={beginRouteTransition} />}
        />
        <Route
          path="/search"
          element={
            <SearchPage
              favorites={favorites}
              recentSearches={recentSearches}
              onRememberSearch={onRememberSearch}
              onToggleFavorite={onToggleFavorite}
              onBeginRouteTransition={beginRouteTransition}
            />
          }
        />
        <Route
          path="/library"
          element={
            <LibraryPage
              favorites={favorites}
              onToggleFavorite={onToggleFavorite}
              recentSearches={recentSearches}
              onBeginRouteTransition={beginRouteTransition}
            />
          }
        />
        <Route
          path="/album/:albumId"
          element={
            <AlbumDetailPage
              favorites={favorites}
              onToggleFavorite={onToggleFavorite}
              onBeginRouteTransition={beginRouteTransition}
            />
          }
        />
      </Routes>

      <div className={`route-transition${routeTransition.active ? ' is-active' : ''}`} aria-hidden={!routeTransition.active}>
        <div className="route-transition-inner">
          <span className="route-spinner" aria-hidden="true" />
          <p>{routeTransition.label}</p>
        </div>
      </div>
    </div>
  );
}

function HomePage({ recentSearches, onRememberSearch, onBeginRouteTransition }) {
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState('');
  const [isNavigating, setIsNavigating] = useState(false);

  function goToSearch(query) {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) return;

    setIsNavigating(true);
    onBeginRouteTransition('Opening results...');
    onRememberSearch(trimmedQuery);
    navigate(`/search?q=${encodeURIComponent(trimmedQuery)}`);
  }

  function handleSubmit(event) {
    event.preventDefault();
    goToSearch(searchValue);
  }

  return (
    <main className="page page-home">
      <section className="home-hero minimal-panel hero-animated-panel">
        <div className="home-hero-layout">
          <div className="home-hero-copy">
            <h1>Start with a search.</h1>

            <form className="home-search-form" onSubmit={handleSubmit}>
              <label className="sr-only" htmlFor="homeSearch">Search albums or artists</label>
              <input
                id="homeSearch"
                type="search"
                placeholder="Search artists, albums, or eras"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
              />
              <button type="submit" disabled={isNavigating || !searchValue.trim()}>
                <span className={`button-label${isNavigating ? ' is-hidden' : ''}`}>Search</span>
                {isNavigating && (
                  <span className="button-loading" aria-live="polite">
                    <span className="button-spinner" aria-hidden="true" />
                    Opening results
                  </span>
                )}
              </button>
            </form>
          </div>

          <aside className="vinyl-showcase" aria-hidden="true">
            <div className="vinyl-record">
              <div className="vinyl-groove vinyl-groove-one" />
              <div className="vinyl-groove vinyl-groove-two" />
              <div className="vinyl-groove vinyl-groove-three" />
              <div className="vinyl-label" />
            </div>
            <div className="tonearm" />
          </aside>
        </div>

        <div className="trend-marquee" aria-label="Trending artists">
          <div className="trend-track">
            {[...TRENDING_ARTISTS, ...TRENDING_ARTISTS].map((item, index) => (
              <button
                type="button"
                className="trend-pill"
                key={`${item}-${index}`}
                onClick={() => goToSearch(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="home-meta-grid">
        <article className="minimal-panel small-panel home-card-rise home-card-delay-1">
          <p className="panel-kicker">Results page</p>
          <h2>Deeper tools after search</h2>
          <p className="panel-copy">Sorting, filters, favorites, detailed album cards, and an artist spotlight panel.</p>
        </article>

        <article className="minimal-panel small-panel home-card-rise home-card-delay-2">
          <p className="panel-kicker">Live spotlight</p>
          <h2>Extra context next to your results</h2>
          <p className="panel-copy">Open the search page to get richer detail panels alongside the album grid.</p>
        </article>

        <article className="minimal-panel small-panel home-card-rise home-card-delay-3">
          <p className="panel-kicker">Recent searches</p>
          <div className="stack-list">
            {recentSearches.length > 0 ? (
              recentSearches.map((item) => (
                <button key={item} type="button" className="text-link-button" onClick={() => goToSearch(item)}>
                  {item}
                </button>
              ))
            ) : (
              <p className="panel-copy">Your recent searches will show up here.</p>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}

function SearchPage({ favorites, recentSearches, onRememberSearch, onToggleFavorite, onBeginRouteTransition }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const query = (searchParams.get('q') || '').trim();

  const [draftQuery, setDraftQuery] = useState(query);
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isSubmittingSearch, setIsSubmittingSearch] = useState(false);
  const [status, setStatus] = useState('Search for an artist or album to load results.');
  const [sort, setSort] = useState('default');
  const [genreFilter, setGenreFilter] = useState('all');
  const [decadeFilter, setDecadeFilter] = useState('all');
  const [artistInsight, setArtistInsight] = useState(null);
  const [artistInsightStatus, setArtistInsightStatus] = useState('Search to load an artist profile.');

  const activeRequestRef = useRef(0);
  const activeInsightRef = useRef(0);
  const rememberSearchRef = useRef(onRememberSearch);

  useEffect(() => {
    rememberSearchRef.current = onRememberSearch;
  }, [onRememberSearch]);

  useEffect(() => {
    setDraftQuery(query);
    setIsSubmittingSearch(false);
  }, [query]);

  useEffect(() => {
    if (!query) {
      setAlbums([]);
      setLoading(false);
      setStatus('Search for an artist or album to load results.');
      return;
    }

    rememberSearchRef.current(query);

    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;
    setLoading(true);
    setIsSubmittingSearch(true);
    setStatus(`Searching iTunes for "${query}"...`);

    async function loadAlbums() {
      try {
        const response = await fetch(buildSearchUrl(query));
        const payload = await response.json();
        const seen = new Set();
        const nextAlbums = [];

        for (const result of payload.results || []) {
          if (!result.collectionName || !result.artworkUrl100) continue;
          if (result.collectionType === 'Compilation') continue;
          if (isBlockedTitle(result.collectionName)) continue;

          const albumKey = `${normalizeText(result.collectionName)}|${normalizeText(result.artistName)}`;
          if (seen.has(albumKey)) continue;

          seen.add(albumKey);
          nextAlbums.push(mapItunesAlbum(result, nextAlbums.length + 1));
        }

        if (activeRequestRef.current !== requestId) return;

        setAlbums(nextAlbums);
        setStatus(nextAlbums.length > 0 ? `${nextAlbums.length} albums loaded from iTunes.` : 'No albums matched this search.');
      } catch (error) {
        if (activeRequestRef.current !== requestId) return;

        setAlbums([]);
        setStatus('The iTunes request failed. Try another search.');
      } finally {
        if (activeRequestRef.current === requestId) {
          setLoading(false);
          setIsSubmittingSearch(false);
        }
      }
    }

    loadAlbums();
  }, [query]);

  let visibleAlbums = [...albums];

  if (genreFilter !== 'all') {
    visibleAlbums = visibleAlbums.filter((album) => album.genre === genreFilter);
  }

  if (decadeFilter !== 'all') {
    visibleAlbums = visibleAlbums.filter((album) => getDecade(album.year) === decadeFilter);
  }

  switch (sort) {
    case 'year-desc':
      visibleAlbums.sort((left, right) => (right.year || 0) - (left.year || 0));
      break;
    case 'year-asc':
      visibleAlbums.sort((left, right) => (left.year || 0) - (right.year || 0));
      break;
    case 'title-az':
      visibleAlbums.sort((left, right) => left.title.localeCompare(right.title));
      break;
    case 'artist-az':
      visibleAlbums.sort((left, right) => left.artist.localeCompare(right.artist));
      break;
    default:
      break;
  }

  const spotlightArtist = visibleAlbums[0]?.artist || albums[0]?.artist || '';

  useEffect(() => {
    if (!spotlightArtist) {
      setArtistInsight(null);
      setArtistInsightStatus('Search to load an artist profile.');
      return;
    }

    const requestId = activeInsightRef.current + 1;
    activeInsightRef.current = requestId;
    setArtistInsightStatus(`Loading Wikipedia profile for ${spotlightArtist}...`);

    async function loadInsight() {
      try {
        const profile = await fetchWikipediaSummary(spotlightArtist);

        if (activeInsightRef.current !== requestId) return;

        if (!profile) {
          setArtistInsight(null);
          setArtistInsightStatus('Wikipedia did not return a clean artist summary for this result.');
          return;
        }

        setArtistInsight(profile);
        setArtistInsightStatus('Artist profile loaded from Wikipedia.');
      } catch (error) {
        if (activeInsightRef.current !== requestId) return;

        setArtistInsight(null);
        setArtistInsightStatus('Wikipedia is unavailable right now.');
      }
    }

    loadInsight();
  }, [spotlightArtist]);

  const uniqueGenres = ['all', ...new Set(albums.map((album) => album.genre))];
  const averageYear = visibleAlbums.length > 0
    ? Math.round(visibleAlbums.reduce((total, album) => total + (album.year || 0), 0) / visibleAlbums.length)
    : null;

  function submitSearch(event) {
    event.preventDefault();
    const trimmedQuery = draftQuery.trim();

    if (!trimmedQuery) return;

    setIsSubmittingSearch(true);
    onBeginRouteTransition('Searching catalog...');
    onRememberSearch(trimmedQuery);
    navigate(`/search?q=${encodeURIComponent(trimmedQuery)}`);
  }

  return (
    <main className="page page-search">
      <section className="search-header minimal-panel">
        <div>
          <p className="panel-kicker">Search page</p>
          <h1>Search, filter, compare, and save albums.</h1>
          <p className="panel-copy">The results page combines iTunes album data with a live Wikipedia artist spotlight.</p>
        </div>

        <form className="results-search-form" onSubmit={submitSearch}>
          <label className="sr-only" htmlFor="resultsSearch">Search artists or albums</label>
          <input
            id="resultsSearch"
            type="search"
            placeholder="Search by artist, album, or era"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
          />
          <button type="submit" disabled={isSubmittingSearch || loading || !draftQuery.trim()}>
            <span className={`button-label${isSubmittingSearch || loading ? ' is-hidden' : ''}`}>Run search</span>
            {(isSubmittingSearch || loading) && (
              <span className="button-loading" aria-live="polite">
                <span className="button-spinner" aria-hidden="true" />
                Searching
              </span>
            )}
          </button>
        </form>

        <div className="search-status-row">
          <p className="status-pill" aria-live="polite">{status}</p>
          <div className="home-chip-row compact-row">
            {recentSearches.slice(0, 5).map((item) => (
              <button
                key={item}
                type="button"
                className="chip-button"
                onClick={() => {
                  onBeginRouteTransition('Searching catalog...');
                  navigate(`/search?q=${encodeURIComponent(item)}`);
                }}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="stats-grid">
        <article className="minimal-panel stat-card">
          <span>Results</span>
          <strong>{visibleAlbums.length}</strong>
        </article>
        <article className="minimal-panel stat-card">
          <span>Genres</span>
          <strong>{Math.max(uniqueGenres.length - 1, 0)}</strong>
        </article>
        <article className="minimal-panel stat-card">
          <span>Favorites saved</span>
          <strong>{favorites.length}</strong>
        </article>
        <article className="minimal-panel stat-card">
          <span>Average year</span>
          <strong>{averageYear || 'N/A'}</strong>
        </article>
      </section>

      <section className="results-layout">
        <div className="results-main">
          <div className="filters-panel minimal-panel">
            <label>
              <span>Sort</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="default">Default order</option>
                <option value="year-desc">Newest first</option>
                <option value="year-asc">Oldest first</option>
                <option value="title-az">Title A-Z</option>
                <option value="artist-az">Artist A-Z</option>
              </select>
            </label>

            <label>
              <span>Genre</span>
              <select value={genreFilter} onChange={(event) => setGenreFilter(event.target.value)}>
                {uniqueGenres.map((item) => (
                  <option key={item} value={item}>{item === 'all' ? 'All genres' : item}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Decade</span>
              <select value={decadeFilter} onChange={(event) => setDecadeFilter(event.target.value)}>
                <option value="all">All decades</option>
                <option value="60s">1960s</option>
                <option value="70s">1970s</option>
                <option value="80s">1980s</option>
                <option value="90s">1990s</option>
                <option value="2000s">2000s</option>
                <option value="2010s">2010s</option>
                <option value="2020s">2020s</option>
              </select>
            </label>
          </div>

          {loading ? (
            <div className="results-grid">
              {[1, 2, 3, 4, 5, 6].map((item) => (
                <article key={item} className="album-card skeleton-card">
                  <div className="card-cover skeleton-block" />
                  <div className="card-body">
                    <div className="skeleton-line skeleton-line-lg" />
                    <div className="skeleton-line" />
                    <div className="skeleton-line skeleton-line-sm" />
                  </div>
                </article>
              ))}
            </div>
          ) : visibleAlbums.length > 0 ? (
            <div className="results-grid">
              {visibleAlbums.map((album, index) => (
                <AlbumCard
                  key={album.collectionId}
                  album={album}
                  index={index}
                  isFavorite={favorites.some((item) => item.collectionId === album.collectionId)}
                  onOpen={() => {
                    onBeginRouteTransition('Opening album details...');
                    navigate(`/album/${album.collectionId}`);
                  }}
                  onToggleFavorite={() => onToggleFavorite(album)}
                  actionLabel="View album"
                />
              ))}
            </div>
          ) : (
            <article className="minimal-panel empty-panel">
              <p className="panel-kicker">No results</p>
              <h2>Nothing matches the current search or filters.</h2>
              <p className="panel-copy">Try a different artist, clear the filters, or use one of the recent searches.</p>
            </article>
          )}
        </div>

        <aside className="results-sidebar">
          <article className="minimal-panel insight-panel">
            <p className="panel-kicker">Wikipedia spotlight</p>
            <p className="status-note">{artistInsightStatus}</p>

            {artistInsight ? (
              <>
                {artistInsight.image && <img className="insight-image" src={artistInsight.image} alt={artistInsight.title} />}
                <h2>{artistInsight.title}</h2>
                <p className="insight-role">{artistInsight.description}</p>
                <p className="panel-copy">{artistInsight.extract}</p>
                {artistInsight.pageUrl && (
                  <a className="external-link" href={artistInsight.pageUrl} target="_blank" rel="noreferrer">
                    Open Wikipedia page
                  </a>
                )}
              </>
            ) : (
              <p className="panel-copy">Pick a result to focus the artist panel, or run a search to load one automatically.</p>
            )}
          </article>
        </aside>
      </section>
    </main>
  );
}

function LibraryPage({ favorites, onToggleFavorite, recentSearches, onBeginRouteTransition }) {
  const navigate = useNavigate();

  return (
    <main className="page page-library">
      <section className="minimal-panel library-header">
        <p className="panel-kicker">Library page</p>
        <h1>Your saved albums.</h1>
        <p className="panel-copy">Use this page as a lightweight collection view for anything saved from the results page.</p>
      </section>

      {favorites.length > 0 ? (
        <section className="results-grid library-grid">
          {favorites.map((album, index) => (
            <AlbumCard
              key={album.collectionId}
              album={album}
              index={index}
              isFavorite
              onOpen={() => {
                onBeginRouteTransition('Opening album details...');
                navigate(`/album/${album.collectionId}`);
              }}
              onToggleFavorite={() => onToggleFavorite(album)}
              actionLabel="Open details"
            />
          ))}
        </section>
      ) : (
        <section className="minimal-panel empty-panel">
          <p className="panel-kicker">Nothing saved yet</p>
          <h2>Your favorites will appear here.</h2>
          <p className="panel-copy">Run a search, save a few albums, and this page becomes your own quick-access library.</p>
          <div className="home-chip-row">
            {recentSearches.map((item) => (
              <button
                key={item}
                type="button"
                className="chip-button"
                onClick={() => {
                  onBeginRouteTransition('Opening results...');
                  navigate(`/search?q=${encodeURIComponent(item)}`);
                }}
              >
                {item}
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function AlbumDetailPage({ favorites, onToggleFavorite, onBeginRouteTransition }) {
  const navigate = useNavigate();
  const { albumId } = useParams();
  const [album, setAlbum] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('Loading album details...');
  const [artistInsight, setArtistInsight] = useState(null);

  useEffect(() => {
    if (!albumId) {
      setAlbum(null);
      setTracks([]);
      setLoading(false);
      setStatus('No album ID was provided.');
      return;
    }

    let isCancelled = false;
    setLoading(true);
    setStatus(`Loading album ${albumId}...`);

    async function loadAlbumDetails() {
      try {
        const response = await fetch(buildLookupUrl(albumId));
        const payload = await response.json();
        const results = payload.results || [];
        const collection = results.find((item) => item.wrapperType === 'collection');
        const songResults = results.filter((item) => item.wrapperType === 'track');

        if (isCancelled) return;

        if (!collection) {
          setAlbum(null);
          setTracks([]);
          setStatus('That album could not be found from the supplied ID.');
          setLoading(false);
          return;
        }

        const mappedAlbum = mapItunesAlbum(collection, collection.collectionId || albumId);
        setAlbum(mappedAlbum);
        setTracks(songResults.slice(0, 10));
        setStatus('Album details loaded.');

        try {
          const profile = await fetchWikipediaSummary(mappedAlbum.artist);
          if (!isCancelled) {
            setArtistInsight(profile);
          }
        } catch (error) {
          if (!isCancelled) {
            setArtistInsight(null);
          }
        }
      } catch (error) {
        if (isCancelled) return;

        setAlbum(null);
        setTracks([]);
        setStatus('Album lookup failed.');
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadAlbumDetails();

    return () => {
      isCancelled = true;
    };
  }, [albumId]);

  const isFavorite = album ? favorites.some((item) => item.collectionId === album.collectionId) : false;

  return (
    <main className="page page-album-detail">
      <section className="minimal-panel album-detail-hero">
        <button
          type="button"
          className="ghost-action album-back-button"
          onClick={() => {
            onBeginRouteTransition('Returning to search...');
            navigate(-1);
          }}
        >
          Back
        </button>

        <p className="status-pill" aria-live="polite">{status}</p>

        {loading ? (
          <div className="album-detail-loading">
            <div className="detail-cover-skeleton skeleton-block" />
            <div className="stack-list">
              <div className="skeleton-line skeleton-line-lg" />
              <div className="skeleton-line" />
              <div className="skeleton-line skeleton-line-sm" />
            </div>
          </div>
        ) : album ? (
          <div className="album-detail-grid">
            <div className="album-detail-cover" style={{ backgroundImage: album.coverUrl ? `url(${album.coverUrl})` : album.gradient }} />

            <div className="album-detail-copy">
              <p className="panel-kicker">Album ID: {album.collectionId}</p>
              <h1>{album.title}</h1>
              <p className="modal-artist">by {album.artist}</p>
              <p className="panel-copy">{album.description}</p>

              <div className="detail-grid">
                <span>{album.genre}</span>
                <span>{album.year || 'Unknown year'}</span>
                <span>{album.tracks} tracks</span>
                <span>{album.price}</span>
              </div>

              <div className="modal-actions">
                <button type="button" className="ghost-action" onClick={() => onToggleFavorite(album)}>
                  {isFavorite ? 'Remove favorite' : 'Save favorite'}
                </button>
                <button
                  type="button"
                  className="ghost-action"
                  onClick={() => {
                    onBeginRouteTransition('Opening artist search...');
                    navigate(`/search?q=${encodeURIComponent(album.artist)}`);
                  }}
                >
                  Search artist
                </button>
                <a className="external-link" href={album.itunesUrl} target="_blank" rel="noreferrer">
                  Open in iTunes
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div className="stack-list">
            <h1>Album not found</h1>
            <p className="panel-copy">The current URL does not match a valid iTunes album lookup.</p>
          </div>
        )}
      </section>

      {album && (
        <section className="album-detail-panels">
          <article className="minimal-panel detail-panel">
            <p className="panel-kicker">Top tracks</p>
            {tracks.length > 0 ? (
              <ol className="track-list">
                {tracks.map((track) => (
                  <li key={track.trackId || track.trackNumber}>
                    <span>{track.trackName}</span>
                    <small>{track.trackTimeMillis ? `${Math.round(track.trackTimeMillis / 60000)} min` : 'Track'}</small>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="panel-copy">Track details were not returned for this album.</p>
            )}
          </article>

          <article className="minimal-panel detail-panel">
            <p className="panel-kicker">Artist spotlight</p>
            {artistInsight ? (
              <>
                {artistInsight.image && <img className="insight-image" src={artistInsight.image} alt={artistInsight.title} />}
                <h2>{artistInsight.title}</h2>
                <p className="insight-role">{artistInsight.description}</p>
                <p className="panel-copy">{artistInsight.extract}</p>
              </>
            ) : (
              <p className="panel-copy">Artist context is still loading or unavailable for this album.</p>
            )}
          </article>
        </section>
      )}
    </main>
  );
}

function AlbumCard({ album, index = 0, isFavorite, onOpen, onToggleFavorite, actionLabel = 'Open details' }) {
  const genreColor = genreColors[album.genre] || genreColors.Pop;

  return (
    <article className="album-card album-card-animated" style={{ animationDelay: `${Math.min(index * 70, 420)}ms` }}>
      <div className="card-cover" style={{ backgroundImage: album.coverUrl ? `url(${album.coverUrl})` : album.gradient }}>
        {!album.coverUrl && <span className="cover-fallback">No cover</span>}
        <span className="card-year-pill">{album.year || 'N/A'}</span>
      </div>

      <div className="card-body">
        <div className="card-actions-top">
          <span className="card-genre" style={{ background: genreColor.bg, color: genreColor.color, borderColor: genreColor.border }}>
            {album.genre}
          </span>
          <button type="button" className={`favorite-button${isFavorite ? ' is-active' : ''}`} onClick={onToggleFavorite}>
            {isFavorite ? 'Saved' : 'Save'}
          </button>
        </div>

        <h3>{album.title}</h3>
        <p className="card-artist">{album.artist}</p>
        <p className="card-tracks">{album.tracks} tracks</p>

        <div className="card-footer-row">
          <span>{album.price}</span>
          <button type="button" className="text-link-button" onClick={onOpen}>
            {actionLabel}
          </button>
        </div>
      </div>
    </article>
  );
}

export default App;