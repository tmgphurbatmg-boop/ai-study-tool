import React, { useState, useCallback, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI, Type } from "@google/genai";

const App = () => {
  // Input State
  const [inputType, setInputType] = useState("text");
  const [generationMode, setGenerationMode] = useState("flashcards");
  const [textContent, setTextContent] = useState("");
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [generateIcons, setGenerateIcons] = useState(false);

  // Generation State
  const [flashcards, setFlashcards] = useState([]);
  const [mcqs, setMcqs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState(null);

  // Viewer State
  const [currentCard, setCurrentCard] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  
  // MCQ State
  const [currentMcq, setCurrentMcq] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);

  // History State
  const [history, setHistory] = useState([]);
  const [isHistoryVisible, setIsHistoryVisible] = useState(false);

  // UI State
  const [theme, setTheme] = useState("default");

  // Load history and theme from localStorage on initial render
  useEffect(() => {
    try {
      const storedHistory = localStorage.getItem('studyAppHistory');
      if (storedHistory) {
        setHistory(JSON.parse(storedHistory));
      }
      const storedTheme = localStorage.getItem('studyAppTheme');
      if (storedTheme) {
        setTheme(storedTheme);
      }
    } catch (e) {
      console.error("Failed to load from localStorage", e);
    }
  }, []);
  
  // Apply theme class to body
  useEffect(() => {
    document.body.className = `theme-${theme}`;
  }, [theme]);

  // Save theme to localStorage
  const handleThemeChange = (selectedTheme) => {
    setTheme(selectedTheme);
    localStorage.setItem('studyAppTheme', selectedTheme);
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const fileToGenerativePart = async (file) => {
    const base64EncodedDataPromise = new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
      reader.readAsDataURL(file);
    });
    return {
      inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
    };
  };

  const handleGenerate = async () => {
    if ((inputType === "text" && !textContent) || (inputType === "image" && !image)) {
      setError("Please provide some content to generate.");
      return;
    }

    setIsLoading(true);
    setLoadingMessage("Generating text content...");
    setError(null);
    setFlashcards([]);
    setMcqs([]);
    setCurrentCard(0);
    setIsFlipped(false);
    
    // Reset MCQ state
    setCurrentMcq(0);
    setSelectedOption(null);
    setIsAnswered(false);
    setScore(0);
    setQuizFinished(false);

    try {
      // Step 1: Generate Text Content (Flashcards/MCQs)
      const contents = { parts: [] };
      if (inputType === 'image') {
        const imagePart = await fileToGenerativePart(image);
        contents.parts.push(imagePart);
      } else {
        contents.parts.push({ text: textContent });
      }

      let response;
      if (generationMode === 'mcqs') {
        const prompt = "Based on the following content, generate a set of multiple-choice questions (MCQs) for studying. Each MCQ should have a 'question', an array of four 'options', and the 'correctAnswer'. The 'correctAnswer' must be one of the strings from the 'options' array. Return the result as a JSON array of objects.";
        contents.parts.push({ text: prompt });
        response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: contents,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctAnswer: { type: Type.STRING }
                },
                required: ["question", "options", "correctAnswer"],
              },
            },
          },
        });
      } else { // Flashcards
        const prompt = "Based on the following content, generate a concise set of flashcards for studying. Each flashcard should have a 'question' and an 'answer'. Return the result as a JSON array of objects, where each object has a 'question' and 'answer' key.";
        contents.parts.push({ text: prompt });
        response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: contents,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  answer: { type: Type.STRING },
                },
                required: ["question", "answer"],
              },
            },
          },
        });
      }

      let parsedResponse = JSON.parse(response.text);

      if (parsedResponse && parsedResponse.length > 0) {
        // Step 2: Conditionally Generate Icons
        if (generateIcons) {
            setLoadingMessage("Generating icons (this may take a moment)...");
            const iconPromises = parsedResponse.map(item => {
                const prompt = `A simple, clean, minimalist vector icon representing '${item.question}'. Flat design on a plain background.`;
                return ai.models.generateImages({
                    model: 'imagen-4.0-generate-001',
                    prompt: prompt,
                    config: { numberOfImages: 1, outputMimeType: 'image/png' }
                });
            });
            const iconResponses = await Promise.all(iconPromises);
            parsedResponse = parsedResponse.map((item, index) => ({
                ...item,
                icon: `data:image/png;base64,${iconResponses[index].generatedImages[0].image.imageBytes}`
            }));
        }

        if (generationMode === 'mcqs') {
          setMcqs(parsedResponse);
        } else {
          setFlashcards(parsedResponse);
        }

        // Step 3: Save to history
        const newHistoryItem = {
          id: Date.now(),
          timestamp: new Date().toISOString(),
          inputType,
          generationMode,
          inputContent: inputType === 'text' ? textContent : imagePreview,
          generatedData: parsedResponse,
          theme: theme,
        };
        const updatedHistory = [newHistoryItem, ...history];
        setHistory(updatedHistory);
        localStorage.setItem('studyAppHistory', JSON.stringify(updatedHistory));
      } else {
        setError("Could not generate content. Please try again with a different source.");
      }
    } catch (e) {
      console.error(e);
      setError("An error occurred while generating. Please check the console for details.");
    } finally {
      setIsLoading(false);
      setLoadingMessage("");
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setError(null);
    }
  };
  
  const resetInput = useCallback(() => {
    setTextContent("");
    setImage(null);
    setImagePreview(null);
    setFlashcards([]);
    setMcqs([]);
    setError(null);
  }, []);
  
  const changeInputType = (type) => {
    setInputType(type);
    resetInput();
  };

  const changeGenerationMode = (mode) => {
    setGenerationMode(mode);
    resetInput();
  };

  const navigateCard = (direction) => {
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentCard((prev) => {
        const next = prev + direction;
        if (next >= 0 && next < flashcards.length) {
          return next;
        }
        return prev;
      });
    }, 150);
  };

  const handleOptionClick = (option) => {
    if (isAnswered) return;
    setIsAnswered(true);
    setSelectedOption(option);
    if (option === mcqs[currentMcq].correctAnswer) {
      setScore(score + 1);
    }
  };

  const handleNextQuestion = () => {
    if (currentMcq < mcqs.length - 1) {
      setCurrentMcq(currentMcq + 1);
      setIsAnswered(false);
      setSelectedOption(null);
    } else {
      setQuizFinished(true);
    }
  };
  
  const restartQuiz = () => {
    setCurrentMcq(0);
    setSelectedOption(null);
    setIsAnswered(false);
    setScore(0);
    setQuizFinished(false);
  }

  const handleViewHistoryItem = (item) => {
    setError(null);
    setGenerationMode(item.generationMode);
    setTheme(item.theme || 'default');
    if(item.generationMode === 'flashcards') {
      setFlashcards(item.generatedData);
      setMcqs([]);
      setCurrentCard(0);
      setIsFlipped(false);
    } else {
      setMcqs(item.generatedData);
      setFlashcards([]);
      restartQuiz();
    }
    setIsHistoryVisible(false);
  }

  const handleClearHistory = () => {
    setHistory([]);
    localStorage.removeItem('studyAppHistory');
  }

  const renderHistoryPanel = () => (
    <div className="history-modal-overlay">
      <div className="history-modal">
        <div className="history-modal-header">
          <h2>Generation History</h2>
          <button className="close-button" onClick={() => setIsHistoryVisible(false)}>&times;</button>
        </div>
        <div className="history-modal-content">
          {history.length === 0 ? (
            <p className="history-empty">Your generation history will appear here.</p>
          ) : (
            history.map(item => (
              <div key={item.id} className="history-item" onClick={() => handleViewHistoryItem(item)}>
                {item.inputType === 'image' ? (
                  <img src={item.inputContent} alt="Input" className="history-item-img" />
                ) : (
                  <div className="history-item-text-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
                    </svg>
                  </div>
                )}
                <div className="history-item-details">
                  <p className="history-item-type">{item.generationMode === 'mcqs' ? 'MCQs' : 'Flashcards'}</p>
                  <p className="history-item-content-preview">
                    {item.inputType === 'text' ? item.inputContent.substring(0, 80) + '...' : 'Image input'}
                  </p>
                  <p className="history-item-date">{new Date(item.timestamp).toLocaleString()}</p>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="history-modal-footer">
          <button onClick={handleClearHistory} disabled={history.length === 0}>Clear All History</button>
        </div>
      </div>
    </div>
  );

  const renderFlashcards = () => {
    const card = flashcards[currentCard];
    return (
        <div className="container flashcard-viewer">
            <div className="flashcard-container" onClick={() => setIsFlipped(!isFlipped)}>
                <div className={`flashcard ${isFlipped ? "flipped" : ""}`}>
                    <div className="card-face card-front">
                        {card.icon && <img src={card.icon} alt="AI Icon" className="card-icon"/>}
                        <span className="card-label">Question</span>
                        <p className="card-content">{card.question}</p>
                    </div>
                    <div className="card-face card-back">
                        <span className="card-label">Answer</span>
                        <p className="card-content">{card.answer}</p>
                    </div>
                </div>
            </div>
            <div className="navigation">
                <button className="nav-button" onClick={() => navigateCard(-1)} disabled={currentCard === 0} aria-label="Previous card">
                &lt;
                </button>
                <span className="card-counter">{currentCard + 1} / {flashcards.length}</span>
                <button className="nav-button" onClick={() => navigateCard(1)} disabled={currentCard === flashcards.length - 1} aria-label="Next card">
                &gt;
                </button>
            </div>
        </div>
    );
  };

  const renderMCQs = () => {
    if (quizFinished) {
      return (
        <div className="container mcq-viewer quiz-summary">
          <h2>Quiz Completed!</h2>
          <p className="score">Your score: {score} / {mcqs.length}</p>
          <button onClick={restartQuiz}>Try Again</button>
        </div>
      )
    }

    const currentQuestion = mcqs[currentMcq];
    return (
      <div className="container mcq-viewer">
        <div className="mcq-header">
          {currentQuestion.icon && <img src={currentQuestion.icon} alt="AI Icon" className="card-icon mcq-icon" />}
          <div className="mcq-question-content">
            <p className="mcq-question">{currentMcq + 1}. {currentQuestion.question}</p>
            <span className="card-counter">{currentMcq + 1} / {mcqs.length}</span>
          </div>
        </div>
        <div className="options-container">
          {currentQuestion.options.map((option, index) => {
            const isCorrect = option === currentQuestion.correctAnswer;
            const isSelected = option === selectedOption;
            let buttonClass = 'option-button';
            if (isAnswered) {
              if (isCorrect) buttonClass += ' correct';
              else if (isSelected && !isCorrect) buttonClass += ' incorrect';
            }
            return (
              <button
                key={index}
                className={buttonClass}
                onClick={() => handleOptionClick(option)}
                disabled={isAnswered}
              >
                {option}
              </button>
            )
          })}
        </div>
        {isAnswered && (
          <button className="next-button" onClick={handleNextQuestion}>
            {currentMcq < mcqs.length - 1 ? 'Next Question' : 'Finish Quiz'}
          </button>
        )}
      </div>
    )
  };

  return (
    <>
      {isHistoryVisible && renderHistoryPanel()}
      <div className="container">
        <header className="app-header">
          <h1>AI Study Tool</h1>
          <div className="header-controls">
            <div className="theme-selector">
              <label htmlFor="theme-select">Theme:</label>
              <select id="theme-select" value={theme} onChange={(e) => handleThemeChange(e.target.value)}>
                <option value="default">Default</option>
                <option value="dark">Dark</option>
                <option value="ocean">Ocean</option>
                <option value="sunset">Sunset</option>
              </select>
            </div>
            <button className="history-button" onClick={() => setIsHistoryVisible(true)} aria-label="View history">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>History</span>
            </button>
          </div>
        </header>
        <div className="mode-selector">
          <button
            className={`tab-button ${generationMode === "flashcards" ? "active" : ""}`}
            onClick={() => changeGenerationMode("flashcards")}
            aria-pressed={generationMode === "flashcards"}
          >
            Flashcards
          </button>
          <button
            className={`tab-button ${generationMode === "mcqs" ? "active" : ""}`}
            onClick={() => changeGenerationMode("mcqs")}
            aria-pressed={generationMode === "mcqs"}
          >
            MCQs
          </button>
        </div>
        <div className="input-section">
          <div className="tabs">
            <button
              className={`tab-button ${inputType === "text" ? "active" : ""}`}
              onClick={() => changeInputType("text")}
              aria-pressed={inputType === "text"}
            >
              Text
            </button>
            <button
              className={`tab-button ${inputType === "image" ? "active" : ""}`}
              onClick={() => changeInputType("image")}
              aria-pressed={inputType === "image"}
            >
              Image
            </button>
          </div>

          {inputType === "text" ? (
            <textarea
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Paste your study material here..."
              rows={6}
              aria-label="Text input for generation"
            ></textarea>
          ) : (
            <>
              <label htmlFor="file-input" className="file-input-label">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
                {image ? `Selected: ${image.name}` : "Click to upload an image"}
              </label>
              <input
                id="file-input"
                type="file"
                accept="image/png, image/jpeg"
                onChange={handleImageChange}
              />
              {imagePreview && <img src={imagePreview} alt="Preview" className="image-preview" />}
            </>
          )}

          <div className="generation-options">
            <label className="toggle-switch">
              <input type="checkbox" checked={generateIcons} onChange={(e) => setGenerateIcons(e.target.checked)} />
              <span className="slider"></span>
            </label>
            <span>Generate AI Icons</span>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isLoading || (inputType === 'text' && !textContent) || (inputType === 'image' && !image)}
          >
            {isLoading ? "Generating..." : `Generate ${generationMode === 'mcqs' ? 'MCQs' : 'Flashcards'}`}
          </button>
        </div>
        {isLoading && (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>{loadingMessage}</p>
          </div>
        )}
        {error && <div className="error">{error}</div>}
      </div>

      {flashcards.length > 0 && !isLoading && generationMode === 'flashcards' && renderFlashcards()}
      {mcqs.length > 0 && !isLoading && generationMode === 'mcqs' && renderMCQs()}
    </>
  );
};

const container = document.getElementById("root");
const root = createRoot(container);
root.render(<App />);