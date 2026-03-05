import { describe, expect, it } from 'vitest'
import { formatHtmlComments } from '../../../client/code-highlight/format-html-comments'

describe('formatHtmlComments', () => {
  describe('no-op cases', () => {
    it('returns lines without comments unchanged', () => {
      const input = `<div class="foo">
  <span>bar</span>
</div>`
      expect(formatHtmlComments(input)).toBe(input)
    })

    it('handles empty string', () => {
      expect(formatHtmlComments('')).toBe('')
    })

    it('preserves empty lines', () => {
      const input = `<div>


</div>`
      expect(formatHtmlComments(input)).toBe(input)
    })

    it('preserves whitespace-only lines', () => {
      const input = `

`
      expect(formatHtmlComments(input)).toBe(input)
    })
  })

  describe('standalone comments (already on their own line)', () => {
    it('preserves comment with no indentation', () => {
      const input = '<!-- comment -->'
      expect(formatHtmlComments(input)).toBe(input)
    })

    it('preserves comment with space indentation', () => {
      const input = '    <!-- a comment -->'
      expect(formatHtmlComments(input)).toBe(input)
    })

    it('preserves comment with tab indentation', () => {
      const input = '\t\t<!-- tabbed comment -->'
      expect(formatHtmlComments(input)).toBe(input)
    })

    it('preserves comment with trailing whitespace', () => {
      const input = '  <!-- comment -->   '
      expect(formatHtmlComments(input)).toBe(input)
    })

    it('preserves empty comment on its own line', () => {
      const input = '  <!---->'
      expect(formatHtmlComments(input)).toBe(input)
    })

    it('preserves comment with only whitespace inside', () => {
      const input = '  <!--   -->'
      expect(formatHtmlComments(input)).toBe(input)
    })

    it('preserves comment containing HTML-like content', () => {
      const input = '  <!-- <div class="foo"> & "quotes" -->'
      expect(formatHtmlComments(input)).toBe(input)
    })

    it('preserves comment with dashes inside', () => {
      const input = '  <!-- some -- dashes -->'
      expect(formatHtmlComments(input)).toBe(input)
    })
  })

  describe('splitting: comment after content', () => {
    it('splits comment that follows a tag', () => {
      expect(formatHtmlComments('  <div><!-- comment -->')).toBe(
        `  <div>
  <!-- comment -->`,
      )
    })

    it('splits comment that follows a self-closing tag', () => {
      expect(formatHtmlComments('  <br/><!-- comment -->')).toBe(
        `  <br/>
  <!-- comment -->`,
      )
    })

    it('splits comment that follows text content', () => {
      expect(formatHtmlComments('  hello world<!-- comment -->')).toBe(
        `  hello world
  <!-- comment -->`,
      )
    })
  })

  describe('splitting: comment before content', () => {
    it('splits comment that precedes a tag', () => {
      expect(formatHtmlComments('  <!-- START --><div>')).toBe(
        `  <!-- START -->
  <div>`,
      )
    })

    it('splits comment that precedes text', () => {
      expect(formatHtmlComments('  <!-- label -->Hello')).toBe(
        `  <!-- label -->
  Hello`,
      )
    })
  })

  describe('splitting: comment between content', () => {
    it('splits comment surrounded by tags', () => {
      expect(formatHtmlComments('    <div><!-- mid --><span>x</span>')).toBe(
        `    <div>
    <!-- mid -->
    <span>x</span>`,
      )
    })

    it('splits comment between closing and opening tags', () => {
      expect(formatHtmlComments('  </div><!-- separator --><section>')).toBe(
        `  </div>
  <!-- separator -->
  <section>`,
      )
    })
  })

  describe('multiple comments on one line', () => {
    it('splits two adjacent comments', () => {
      expect(formatHtmlComments('  <!-- A --><!-- B -->')).toBe(
        `  <!-- A -->
  <!-- B -->`,
      )
    })

    it('splits two comments with content between them', () => {
      expect(formatHtmlComments('  <!-- A --><div><!-- B -->')).toBe(
        `  <!-- A -->
  <div>
  <!-- B -->`,
      )
    })

    it('splits three comments interspersed with content', () => {
      expect(formatHtmlComments('<!-- A --><div><!-- B --></div><!-- C -->')).toBe(
        `<!-- A -->
<div>
<!-- B -->
</div>
<!-- C -->`,
      )
    })

    it('splits multiple adjacent comments without any content', () => {
      expect(formatHtmlComments('<!-- A --><!-- B --><!-- C -->')).toBe(
        `<!-- A -->
<!-- B -->
<!-- C -->`,
      )
    })
  })

  describe('indentation preservation', () => {
    it('preserves zero indentation', () => {
      expect(formatHtmlComments('<div><!-- comment --></div>')).toBe(
        `<div>
<!-- comment -->
</div>`,
      )
    })

    it('preserves deep space indentation', () => {
      expect(formatHtmlComments('            <div><!-- comment --></div>')).toBe(
        `            <div>
            <!-- comment -->
            </div>`,
      )
    })

    it('preserves tab indentation', () => {
      expect(formatHtmlComments('\t\t<div><!-- comment --></div>')).toBe(
        `\t\t<div>
\t\t<!-- comment -->
\t\t</div>`,
      )
    })

    it('preserves mixed tab and space indentation', () => {
      expect(formatHtmlComments('\t  <div><!-- comment --></div>')).toBe(
        `\t  <div>
\t  <!-- comment -->
\t  </div>`,
      )
    })
  })

  describe('multiline input', () => {
    it('only transforms lines that need it, leaving others untouched', () => {
      const input = `<header>
  <div><!-- NAV START --><nav>
    <a href="/">Home</a>
  </nav><!-- NAV END --></div>
</header>`

      const expected = `<header>
  <div>
  <!-- NAV START -->
  <nav>
    <a href="/">Home</a>
  </nav>
  <!-- NAV END -->
  </div>
</header>`

      expect(formatHtmlComments(input)).toBe(expected)
    })

    it('handles standalone comment lines mixed with inline comments', () => {
      const input = `  <!-- standalone -->
  <div><!-- inline --></div>
  <!-- another standalone -->`

      const expected = `  <!-- standalone -->
  <div>
  <!-- inline -->
  </div>
  <!-- another standalone -->`

      expect(formatHtmlComments(input)).toBe(expected)
    })
  })

  describe('edge cases', () => {
    it('leaves unclosed comment unchanged', () => {
      const input = '  <div><!-- unclosed comment'
      expect(formatHtmlComments(input)).toBe(input)
    })

    it('leaves orphaned closing --> unchanged', () => {
      const input = '  some text -->'
      expect(formatHtmlComments(input)).toBe(input)
    })

    it('handles empty comment inline with content', () => {
      expect(formatHtmlComments('  <div><!----><span>')).toBe(
        `  <div>
  <!---->
  <span>`,
      )
    })

    it('handles conditional IE-style comment', () => {
      const input = '  <!--[if IE]><link href="ie.css"><![endif]-->'
      expect(formatHtmlComments(input)).toBe(input)
    })

    it('splits conditional IE-style comment when inline with other content', () => {
      expect(formatHtmlComments('  <head><!--[if IE]><link href="ie.css"><![endif]--></head>')).toBe(
        `  <head>
  <!--[if IE]><link href="ie.css"><![endif]-->
  </head>`,
      )
    })

    it('handles comment with arrow-like content that looks like closing', () => {
      const input = '  <!-- a -- > b -->'
      expect(formatHtmlComments(input)).toBe(input)
    })

    it('handles whitespace between tag and comment', () => {
      expect(formatHtmlComments('  <div>   <!-- comment -->')).toBe(
        `  <div>
  <!-- comment -->`,
      )
    })

    it('handles whitespace between comment and tag', () => {
      expect(formatHtmlComments('  <!-- comment -->   <div>')).toBe(
        `  <!-- comment -->
  <div>`,
      )
    })

    it('handles line that is only <!-- (partial, no close)', () => {
      const input = '<!--'
      expect(formatHtmlComments(input)).toBe(input)
    })

    it('handles comment immediately followed by another with no space', () => {
      expect(formatHtmlComments('    <!-- START --><!-- END -->')).toBe(
        `    <!-- START -->
    <!-- END -->`,
      )
    })

    it('does not produce extra blank lines from whitespace-only segments', () => {
      const result = formatHtmlComments('  <div>   <!-- x -->   </div>')
      const lines = result.split('\n')
      expect(lines.every(l => l.trim().length > 0)).toBe(true)
    })

    it('handles multiple comments separated only by whitespace', () => {
      expect(formatHtmlComments('  <!-- A -->   <!-- B -->   <!-- C -->')).toBe(
        `  <!-- A -->
  <!-- B -->
  <!-- C -->`,
      )
    })

    it('handles a realistic Pug-compiled block', () => {
      const input = `<div class="content-wrapper">
  <div class="container"><!-- START CONTENT --><main class="main" role="main">
    <h1>Title</h1>
  </main><!-- END CONTENT --></div><!-- END CONTAINER -->
</div>`

      const expected = `<div class="content-wrapper">
  <div class="container">
  <!-- START CONTENT -->
  <main class="main" role="main">
    <h1>Title</h1>
  </main>
  <!-- END CONTENT -->
  </div>
  <!-- END CONTAINER -->
</div>`

      expect(formatHtmlComments(input)).toBe(expected)
    })
  })
})
