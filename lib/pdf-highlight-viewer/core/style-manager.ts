
import { CategoryStyle, CategoryStyleManager as ICategoryStyleManager } from '../types';

export class CategoryStyleManager implements ICategoryStyleManager {
  private styles = new Map<string, CategoryStyle>();
  private styleSheet: CSSStyleSheet | null = null;
  private styleElement: HTMLStyleElement | null = null;

  constructor() {
    this.initializeStyleSheet();
    this.registerDefaultCategories();
  }

  /**
   * Initialize CSS style sheet for dynamic styles
   */
  private initializeStyleSheet(): void {
    // Create style element
    this.styleElement = document.createElement('style');
    this.styleElement.id = 'pdf-highlight-dynamic-styles';
    document.head.appendChild(this.styleElement);

    // Get stylesheet reference
    if (this.styleElement.sheet) {
      this.styleSheet = this.styleElement.sheet;
    }
  }

  /**
   * Register default category styles
   */
  private registerDefaultCategories(): void {
    const defaultCategories = [
      {
        name: 'protein',
        style: {
          backgroundColor: 'rgba(255, 200, 0, 0.3)',
          borderColor: 'rgba(255, 180, 0, 0.6)',
          opacity: 0.3,
          hoverOpacity: 0.5,
          pulseAnimation: false
        }
      },
      {
        name: 'gene',
        style: {
          backgroundColor: 'rgba(0, 200, 100, 0.3)',
          borderColor: 'rgba(0, 180, 90, 0.6)',
          opacity: 0.3,
          hoverOpacity: 0.5,
          pulseAnimation: false
        }
      },
      {
        name: 'disease',
        style: {
          backgroundColor: 'rgba(220, 50, 50, 0.3)',
          borderColor: 'rgba(200, 40, 40, 0.6)',
          opacity: 0.3,
          hoverOpacity: 0.5,
          pulseAnimation: true
        }
      },
      {
        name: 'chemical',
        style: {
          backgroundColor: 'rgba(0, 150, 255, 0.3)',
          borderColor: 'rgba(0, 130, 235, 0.6)',
          opacity: 0.3,
          hoverOpacity: 0.5,
          pulseAnimation: false
        }
      },
      {
        name: 'species',
        style: {
          backgroundColor: 'rgba(150, 100, 200, 0.3)',
          borderColor: 'rgba(130, 80, 180, 0.6)',
          opacity: 0.3,
          hoverOpacity: 0.5,
          pulseAnimation: false
        }
      }
    ];

    defaultCategories.forEach(({ name, style }) => {
      this.registerCategory(name, style);
    });
  }

  /**
   * Register a new category style
   */
  registerCategory(name: string, style: CategoryStyle): void {
    const fullStyle: Required<CategoryStyle> = {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      opacity: style.opacity ?? 0.3,
      hoverOpacity: style.hoverOpacity ?? 0.5,
      pulseAnimation: style.pulseAnimation ?? false
    };

    this.styles.set(name, fullStyle);
    this.updateStyleSheet(name, fullStyle);
  }

  /**
   * Update existing category style
   */
  updateCategoryStyle(name: string, partialStyle: Partial<CategoryStyle>): void {
    const existingStyle = this.styles.get(name);
    if (!existingStyle) {
      console.warn(`Category '${name}' not found. Registering as new category.`);
      this.registerCategory(name, partialStyle as CategoryStyle);
      return;
    }

    const updatedStyle = { ...existingStyle, ...partialStyle };
    this.styles.set(name, updatedStyle);
    this.updateStyleSheet(name, this.ensureCompleteStyle(updatedStyle));
  }

  /**
   * Ensure CategoryStyle has all required properties
   */
  private ensureCompleteStyle(style: CategoryStyle): Required<CategoryStyle> {
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      opacity: style.opacity ?? 0.3,
      hoverOpacity: style.hoverOpacity ?? 0.6,
      pulseAnimation: style.pulseAnimation ?? false
    };
  }

  /**
   * Generate and inject CSS for a category
   */
  private updateStyleSheet(category: string, style: Required<CategoryStyle>): void {
    if (!this.styleSheet) return;

    // Remove existing rules for this category
    this.removeRulesForCategory(category);

    const cssRules = this.generateCSSRules(category, style);

    // Add new rules
    cssRules.forEach(rule => {
      try {
        this.styleSheet!.insertRule(rule, this.styleSheet!.cssRules.length);
      } catch (error) {
        console.warn('Failed to insert CSS rule:', rule, error);
      }
    });
  }

  /**
   * Generate CSS rules for a category
   */
  private generateCSSRules(category: string, style: Required<CategoryStyle>): string[] {
    const rules: string[] = [];

    // Base highlight style
    rules.push(`
      .${category}-highlight .highlight-background {
        background: ${style.backgroundColor};
        border: 1px solid ${style.borderColor};
        opacity: ${style.opacity};
        transition: opacity 0.2s ease, transform 0.2s ease;
      }
    `);

    // Hover state
    rules.push(`
      .${category}-highlight:hover .highlight-background {
        opacity: ${style.hoverOpacity};
        transform: scale(1.02);
      }
    `);

    // Selected state
    rules.push(`
      .${category}-highlight.selected .highlight-background {
        opacity: 1;
        border: 2px solid ${this.darkenColor(style.borderColor)};
        outline: 2px solid #007acc;
        outline-offset: 1px;
      }
    `);

    // Focus state (accessibility)
    rules.push(`
      .${category}-highlight:focus .highlight-background {
        opacity: 0.8;
        outline: 2px solid #007acc;
        outline-offset: 2px;
      }
    `);

    // Pulse animation (if enabled)
    if (style.pulseAnimation) {
      rules.push(`
        .${category}-highlight .highlight-background {
          animation: pulse-${category} 2s ease-in-out infinite alternate;
        }
      `);

      rules.push(`
        @keyframes pulse-${category} {
          from { opacity: ${style.opacity}; }
          to { opacity: ${style.hoverOpacity}; }
        }
      `);
    }

    // High contrast support
    rules.push(`
      @media (prefers-contrast: high) {
        .${category}-highlight .highlight-background {
          border-width: 2px !important;
          opacity: 0.8 !important;
        }
      }
    `);

    // Print styles
    rules.push(`
      @media print {
        .${category}-highlight .highlight-background {
          opacity: 0.6 !important;
          animation: none !important;
        }
      }
    `);

    return rules;
  }

  /**
   * Remove existing CSS rules for a category
   */
  private removeRulesForCategory(category: string): void {
    if (!this.styleSheet) return;

    const rulesToRemove: number[] = [];
    
    for (let i = 0; i < this.styleSheet.cssRules.length; i++) {
      const rule = this.styleSheet.cssRules[i];
      if (rule instanceof CSSStyleRule) {
        if (rule.selectorText.includes(`.${category}-highlight`) ||
            rule.cssText.includes(`pulse-${category}`)) {
          rulesToRemove.unshift(i); // Add to beginning to remove in reverse order
        }
      }
      if (rule instanceof CSSKeyframesRule) {
        if (rule.name === `pulse-${category}`) {
          rulesToRemove.unshift(i);
        }
      }
    }

    rulesToRemove.forEach(index => {
      try {
        this.styleSheet!.deleteRule(index);
      } catch (error) {
        console.warn('Failed to delete CSS rule at index:', index, error);
      }
    });
  }

  /**
   * Get computed style for a term
   */
  getComputedStyle(
    termId: string, 
    state: 'default' | 'hover' | 'selected' = 'default'
  ): React.CSSProperties {
    // For now, return category-based styles
    // In a full implementation, you'd look up the term's category
    const category = this.getCategoryForTerm(termId);
    const style = this.styles.get(category);
    
    if (!style) {
      return {};
    }

    const baseStyle: React.CSSProperties = {
      background: style.backgroundColor,
      border: `1px solid ${style.borderColor}`,
      opacity: style.opacity,
      transition: 'opacity 0.2s ease, transform 0.2s ease'
    };

    switch (state) {
      case 'hover':
        return {
          ...baseStyle,
          opacity: style.hoverOpacity,
          transform: 'scale(1.02)'
        };
      case 'selected':
        return {
          ...baseStyle,
          opacity: 1,
          border: `2px solid ${this.darkenColor(style.borderColor)}`,
          outline: '2px solid #007acc',
          outlineOffset: '1px'
        };
      default:
        return baseStyle;
    }
  }

  /**
   * Get category for a term (simplified implementation)
   */
  private getCategoryForTerm(termId: string): string {
    // In a real implementation, you'd look this up from your data
    // For now, return a default category
    return 'protein';
  }

  /**
   * Darken a color (utility function)
   */
  private darkenColor(color: string): string {
    // Simple darkening by reducing opacity or converting rgba values
    if (color.startsWith('rgba')) {
      return color.replace(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/, (match, r, g, b, a) => {
        const newR = Math.max(0, parseInt(r) - 40);
        const newG = Math.max(0, parseInt(g) - 40);
        const newB = Math.max(0, parseInt(b) - 40);
        return `rgba(${newR}, ${newG}, ${newB}, ${a})`;
      });
    }
    return color; // Return original if not rgba
  }

  /**
   * Get all registered categories
   */
  getCategories(): string[] {
    return Array.from(this.styles.keys());
  }

  /**
   * Get style for a category
   */
  getCategoryStyle(category: string): CategoryStyle | undefined {
    return this.styles.get(category);
  }

  /**
   * Apply theme (light/dark)
   */
  applyTheme(theme: 'light' | 'dark'): void {
    const themeMultiplier = theme === 'dark' ? 1.2 : 1.0;
    
    // Update all categories with theme adjustments
    for (const [category, style] of this.styles) {
      const adjustedStyle = {
        ...style,
        opacity: Math.min(1, (style.opacity ?? 0.3) * themeMultiplier),
        hoverOpacity: Math.min(1, (style.hoverOpacity ?? 0.6) * themeMultiplier)
      };
      this.updateStyleSheet(category, this.ensureCompleteStyle(adjustedStyle));
    }
  }

  /**
   * Enable/disable animations globally
   */
  setAnimationsEnabled(enabled: boolean): void {
    if (!this.styleSheet) return;

    // Add or remove global animation disable rule
    const ruleText = enabled ? '' : `
      .highlight-background,
      .highlight-wrapper {
        animation: none !important;
        transition: none !important;
      }
    `;

    // Remove existing animation rule
    this.removeRuleByContent('animation: none !important');

    // Add new rule if animations disabled
    if (!enabled && ruleText) {
      try {
        this.styleSheet.insertRule(ruleText, this.styleSheet.cssRules.length);
      } catch (error) {
        console.warn('Failed to insert animation disable rule:', error);
      }
    }
  }

  /**
   * Remove CSS rule by content
   */
  private removeRuleByContent(content: string): void {
    if (!this.styleSheet) return;

    for (let i = this.styleSheet.cssRules.length - 1; i >= 0; i--) {
      const rule = this.styleSheet.cssRules[i];
      if (rule.cssText.includes(content)) {
        try {
          this.styleSheet.deleteRule(i);
        } catch (error) {
          console.warn('Failed to delete CSS rule:', error);
        }
      }
    }
  }

  /**
   * Export current styles as CSS string
   */
  exportStyles(): string {
    if (!this.styleElement) return '';
    return this.styleElement.textContent || '';
  }

  /**
   * Import styles from CSS string
   */
  importStyles(cssString: string): void {
    if (this.styleElement) {
      this.styleElement.textContent = cssString;
    }
  }

  /**
   * Reset all styles to defaults
   */
  resetToDefaults(): void {
    this.styles.clear();
    if (this.styleElement) {
      this.styleElement.textContent = '';
    }
    this.registerDefaultCategories();
  }

  /**
   * Destroy style manager and clean up
   */
  destroy(): void {
    if (this.styleElement && this.styleElement.parentNode) {
      this.styleElement.parentNode.removeChild(this.styleElement);
    }
    this.styles.clear();
    this.styleSheet = null;
    this.styleElement = null;
  }
}