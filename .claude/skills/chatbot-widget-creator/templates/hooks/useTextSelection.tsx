import { useState, useEffect, useRef, useCallback } from 'react';

export interface TextSelectionState {
  text: string;
  range: Range | null;
  rect: DOMRect | null;
  isValid: boolean;
  isTooLong: boolean;
  truncatedText: string;
}

interface UseTextSelectionOptions {
  maxLength?: number;
  debounceMs?: number;
  enabled?: boolean;
}

export function useTextSelection({
  maxLength = 2000,
  debounceMs = 300,
  enabled = true
}: UseTextSelectionOptions = {}) {
  const [selection, setSelection] = useState<TextSelectionState>({
    text: '',
    range: null,
    rect: null,
    isValid: false,
    isTooLong: false,
    truncatedText: ''
  });

  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear existing debounce timeout
  const clearDebounceTimeout = useCallback(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
  }, []);

  // Process text selection with validation
  const processSelection = useCallback(() => {
    if (!enabled) {
      if (selection.text !== '') {
        setSelection({
          text: '',
          range: null,
          rect: null,
          isValid: false,
          isTooLong: false,
          truncatedText: ''
        });
        setIsTooltipVisible(false);
      }
      return;
    }

    const userSelection = window.getSelection();
    if (!userSelection || userSelection.isCollapsed) {
      if (selection.text !== '') {
        setSelection({
          text: '',
          range: null,
          rect: null,
          isValid: false,
          isTooLong: false,
          truncatedText: ''
        });
        setIsTooltipVisible(false);
      }
      return;
    }

    try {
      const range = userSelection.getRangeAt(0);
      const selectedText = range.toString().trim();

      if (!selectedText) {
        if (selection.text !== '') {
          setSelection({
            text: '',
            range: null,
            rect: null,
            isValid: false,
            isTooLong: false,
            truncatedText: ''
          });
          setIsTooltipVisible(false);
        }
        return;
      }

      // Check if selection is within valid content areas
      const startNode = range.startContainer;
      const endNode = range.endContainer;

      // Find the closest parent elements
      const startElement = startNode.nodeType === Node.TEXT_NODE ? startNode.parentElement : startNode as Element;
      const endElement = endNode.nodeType === Node.TEXT_NODE ? endNode.parentElement : endNode as Element;

      // Validate selection is within content areas (exclude buttons, inputs, etc.)
      const isInvalidElement = (element: Element | null) => {
        if (!element) return false;
        const tagName = element.tagName.toLowerCase();
        const invalidTags = ['button', 'input', 'textarea', 'select', 'option'];
        return invalidTags.includes(tagName) || element.closest('.no-selection');
      };

      if (isInvalidElement(startElement) || isInvalidElement(endElement)) {
        if (selection.text !== '') {
          setSelection({
            text: '',
            range: null,
            rect: null,
            isValid: false,
            isTooLong: false,
            truncatedText: ''
          });
          setIsTooltipVisible(false);
        }
        return;
      }

      const isTooLong = selectedText.length > maxLength;
      const truncatedText = isTooLong
        ? selectedText.substring(0, maxLength) + '...'
        : selectedText;

      // Get selection bounds for tooltip positioning
      const rect = range.getBoundingClientRect();

      // Only update state if something actually changed
      const shouldUpdate =
        selection.text !== selectedText ||
        selection.isTooLong !== isTooLong ||
        selection.truncatedText !== truncatedText;

      if (shouldUpdate) {
        setSelection({
          text: selectedText,
          range,
          rect,
          isValid: true,
          isTooLong,
          truncatedText
        });
        setIsTooltipVisible(true);
      }

    } catch (error) {
      console.warn('Error processing text selection:', error);
      if (selection.text !== '') {
        setSelection({
          text: '',
          range: null,
          rect: null,
          isValid: false,
          isTooLong: false,
          truncatedText: ''
        });
        setIsTooltipVisible(false);
      }
    }
  }, [enabled, maxLength, selection.text, selection.isTooLong, selection.truncatedText, selection.rect]);

  // Debounced selection handler
  const handleSelectionChange = useCallback(() => {
    clearDebounceTimeout();
    debounceTimeoutRef.current = setTimeout(() => {
      processSelection();
    }, debounceMs);
  }, [processSelection, debounceMs, clearDebounceTimeout]);

  // Global selection listeners
  useEffect(() => {
    if (!enabled) return;

    const debouncedHandler = () => {
      clearDebounceTimeout();
      debounceTimeoutRef.current = setTimeout(() => {
        processSelection();
      }, debounceMs);
    };

    document.addEventListener('selectionchange', debouncedHandler);
    document.addEventListener('mouseup', debouncedHandler);
    document.addEventListener('touchend', debouncedHandler);

    return () => {
      document.removeEventListener('selectionchange', debouncedHandler);
      document.removeEventListener('mouseup', debouncedHandler);
      document.removeEventListener('touchend', debouncedHandler);
      clearDebounceTimeout();
    };
  }, [enabled, debounceMs, clearDebounceTimeout]);

  // Hide tooltip when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (target.closest('.selection-tooltip') || target.closest('.no-selection')) {
        return;
      }

      // Check if click is within the current selection
      const userSelection = window.getSelection();
      if (userSelection && !userSelection.isCollapsed) {
        const range = userSelection.getRangeAt(0);
        if (range && !range.collapsed) {
          // Check if click is within selection bounds
          const rect = range.getBoundingClientRect();
          if (
            event.clientX >= rect.left &&
            event.clientX <= rect.right &&
            event.clientY >= rect.top &&
            event.clientY <= rect.bottom
          ) {
            return;
          }
        }
      }

      setIsTooltipVisible(false);
    };

    if (enabled) {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [enabled]);

  // Clear selection and hide tooltip
  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setSelection({
      text: '',
      range: null,
      rect: null,
      isValid: false,
      isTooLong: false,
      truncatedText: ''
    });
    setIsTooltipVisible(false);
  }, []);

  return {
    selection,
    isTooltipVisible,
    clearSelection,
    setIsTooltipVisible
  };
}