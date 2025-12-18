import {
  HighlightData,
  InputHighlightData,
  TermOccurrence,
  CategoryStyle,
  BoundingBox,
} from '../types';

export type { InputHighlightData, BBox, HighlightStyle } from '../types';

export interface AdapterOptions {
  categoryResolver?: (highlight: InputHighlightData) => string;
  termNameResolver?: (highlight: InputHighlightData) => string;
  groupByStyle?: boolean;
  useTooltipAsTermName?: boolean;
  defaultCategory?: string;
}

export function adaptHighlightData(
  inputData: InputHighlightData[],
  options: AdapterOptions = {}
): HighlightData {
  const {
    defaultCategory = 'default',
    groupByStyle = true,
    categoryResolver,
    useTooltipAsTermName = true,
    termNameResolver,
  } = options;

  const result: HighlightData = {};
  const categoryStyles = new Map<string, CategoryStyle>();

  inputData.forEach((highlight) => {
    let category: string;
    if (categoryResolver) {
      category = categoryResolver(highlight);
    } else if (highlight.metadata?.category) {
      category = highlight.metadata.category as string;
    } else if (groupByStyle && highlight.style) {
      category = highlight.style.backgroundColor || defaultCategory;
    } else {
      category = defaultCategory;
    }

    let termName: string;
    if (termNameResolver) {
      termName = termNameResolver(highlight);
    } else if (useTooltipAsTermName && highlight.tooltipText) {
      termName = highlight.tooltipText;
    } else {
      termName = highlight.id;
    }

    if (!result[category]) {
      result[category] = {
        pages: {},
        terms: {},
      };
    }

    if (highlight.style && !categoryStyles.has(category)) {
      categoryStyles.set(category, {
        backgroundColor: highlight.style.backgroundColor,
        borderColor: highlight.style.borderColor || highlight.style.backgroundColor,
        opacity: highlight.style.opacity,
        hoverOpacity: highlight.style.hoverOpacity,
        pulseAnimation: highlight.style.pulseAnimation,
      });
    }

    const pageGroups = new Map<number, BoundingBox[]>();
    highlight.bboxes.forEach((bbox) => {
      const { page, ...coords } = bbox;
      if (!pageGroups.has(page)) {
        pageGroups.set(page, []);
      }
      pageGroups.get(page)!.push(coords);
    });

    const allPages: number[] = [];
    pageGroups.forEach((coordinates, pageNumber) => {
      allPages.push(pageNumber);
      const pageKey = pageNumber.toString();

      if (!result[category].pages[pageKey]) {
        result[category].pages[pageKey] = [];
      }

      // Add term occurrence to this page
      const termOccurrence: TermOccurrence = {
        termId: highlight.id,
        coordinates,
      };

      result[category].pages[pageKey].push(termOccurrence);
    });

    if (!result[category].terms[highlight.id]) {
      result[category].terms[highlight.id] = {
        term: termName,
        category,
        frequency: pageGroups.size,
        aliases: [],
        relatedTerms: [],
        pages: allPages,
        explanations: highlight.tooltipText
          ? allPages.map((page) => ({
              page,
              coordinates: pageGroups.get(page)![0],
              text: highlight.tooltipText!,
            }))
          : [],
      };

      if (highlight.metadata) {
        (result[category].terms[highlight.id] as any).metadata = highlight.metadata;
      }
    }
  });

  return result;
}

export function extractCategoryStyles(
  inputData: InputHighlightData[],
  options: AdapterOptions = {}
): Map<string, CategoryStyle> {
  const { defaultCategory = 'default', groupByStyle = true, categoryResolver } = options;

  const styles = new Map<string, CategoryStyle>();

  inputData.forEach((highlight) => {
    if (!highlight.style) return;

    let category: string;
    if (categoryResolver) {
      category = categoryResolver(highlight);
    } else if (highlight.metadata?.category) {
      category = highlight.metadata.category as string;
    } else if (groupByStyle) {
      category = highlight.style.backgroundColor || defaultCategory;
    } else {
      category = defaultCategory;
    }

    if (!styles.has(category)) {
      styles.set(category, {
        backgroundColor: highlight.style.backgroundColor,
        borderColor: highlight.style.borderColor || highlight.style.backgroundColor,
        opacity: highlight.style.opacity,
        hoverOpacity: highlight.style.hoverOpacity,
        pulseAnimation: highlight.style.pulseAnimation,
      });
    }
  });

  return styles;
}

/**
 * Validate input highlight data structure
 * Useful for debugging and error handling
 *
 * @param inputData - Data to validate
 * @returns Object with validation result and any errors found
 */
export function validateInputData(inputData: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!Array.isArray(inputData)) {
    errors.push('Input data must be an array');
    return { valid: false, errors };
  }

  inputData.forEach((item, index) => {
    if (!item.id || typeof item.id !== 'string') {
      errors.push(`Item ${index}: 'id' is required and must be a string`);
    }

    if (!Array.isArray(item.bboxes)) {
      errors.push(`Item ${index}: 'bboxes' must be an array`);
    } else {
      item.bboxes.forEach((bbox: any, bboxIndex: number) => {
        const requiredProps = ['x1', 'y1', 'x2', 'y2', 'page'];
        requiredProps.forEach((prop) => {
          if (typeof bbox[prop] !== 'number') {
            errors.push(`Item ${index}, bbox ${bboxIndex}: '${prop}' must be a number`);
          }
        });
      });
    }

    if (item.style) {
      if (!item.style.backgroundColor) {
        errors.push(`Item ${index}: style.backgroundColor is required when style is provided`);
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Merge multiple HighlightData objects into one
 * Useful when loading highlights from multiple sources
 *
 * @param highlightDataArray - Array of HighlightData objects to merge
 * @returns Merged HighlightData object
 */
export function mergeHighlightData(...highlightDataArray: HighlightData[]): HighlightData {
  const result: HighlightData = {};

  highlightDataArray.forEach((data) => {
    Object.entries(data).forEach(([category, categoryData]) => {
      if (!result[category]) {
        result[category] = {
          pages: {},
          terms: {},
        };
      }

      Object.entries(categoryData.pages).forEach(([pageKey, occurrences]) => {
        if (!result[category].pages[pageKey]) {
          result[category].pages[pageKey] = [];
        }
        result[category].pages[pageKey].push(...occurrences);
      });

      Object.entries(categoryData.terms).forEach(([termId, termData]) => {
        if (!result[category].terms[termId]) {
          result[category].terms[termId] = termData;
        } else {
          result[category].terms[termId].pages = [
            ...new Set([...result[category].terms[termId].pages, ...termData.pages]),
          ];
          result[category].terms[termId].explanations = [
            ...result[category].terms[termId].explanations,
            ...termData.explanations,
          ];
        }
      });
    });
  });

  return result;
}
