// Best-effort MSVC name demangler for plain member functions (the common case for
// MCBE signatures). It intentionally bails out (returns null) rather than guessing
// on anything it isn't sure about: operators, constructors/destructors, free
// functions, rvalue references, arrays and back-references (0-9 substitution
// tokens) are all unsupported and fall back to null so the caller can leave the
// field for manual entry instead of showing a wrong signature.

const BASIC_TYPES: Record<string, string> = {
	X: 'void',
	C: 'signed char',
	D: 'char',
	E: 'unsigned char',
	F: 'short',
	G: 'unsigned short',
	H: 'int',
	I: 'unsigned int',
	J: 'long',
	K: 'unsigned long',
	M: 'float',
	N: 'double',
	O: 'long double',
	_N: 'bool',
	_J: '__int64',
	_K: 'unsigned __int64',
	_W: 'wchar_t'
};

class DemangleError extends Error {}

type Cursor = { pos: number };

function readNameComponents(s: string, pos: number): { components: string[]; next: number } {
	const components: string[] = [];
	while (true) {
		if (s[pos] === '@') {
			pos++;
			break;
		}
		if (s[pos] === undefined) throw new DemangleError('unexpected end in name');
		if (s[pos] === '?' && s[pos + 1] === '$') {
			pos += 2;
			const start = pos;
			while (s[pos] !== '@') {
				if (s[pos] === undefined) throw new DemangleError('unexpected end in template name');
				pos++;
			}
			const templateName = s.slice(start, pos);
			pos++;
			const args: string[] = [];
			while (s[pos] !== '@') {
				const cursor: Cursor = { pos };
				args.push(parseType(s, cursor));
				pos = cursor.pos;
			}
			pos++;
			components.push(`${templateName}<${args.join(', ')}>`);
		} else if (/[0-9]/.test(s[pos])) {
			throw new DemangleError('back-references are not supported');
		} else {
			const start = pos;
			while (s[pos] !== '@') {
				if (s[pos] === undefined) throw new DemangleError('unexpected end in identifier');
				pos++;
			}
			components.push(s.slice(start, pos));
			pos++;
		}
	}
	return { components, next: pos };
}

function qualifiedTypeName(components: string[]): string {
	return components.slice().reverse().join('::');
}

function parseType(s: string, cursor: Cursor): string {
	const c = s[cursor.pos];
	if (c === undefined) throw new DemangleError('unexpected end parsing type');

	if (c === '_') {
		const code = s.slice(cursor.pos, cursor.pos + 2);
		if (!(code in BASIC_TYPES)) throw new DemangleError(`unknown extended type code ${code}`);
		cursor.pos += 2;
		return BASIC_TYPES[code];
	}

	if (c in BASIC_TYPES) {
		cursor.pos += 1;
		return BASIC_TYPES[c];
	}

	if (c === 'V' || c === 'U' || c === 'T') {
		cursor.pos += 1;
		const { components, next } = readNameComponents(s, cursor.pos);
		cursor.pos = next;
		return qualifiedTypeName(components);
	}

	if (c === 'W') {
		// enum: W<digit><qualified name>
		cursor.pos += 2;
		const { components, next } = readNameComponents(s, cursor.pos);
		cursor.pos = next;
		return qualifiedTypeName(components);
	}

	if (c === 'P' || c === 'A') {
		// pointer (P) or lvalue reference (A)
		const isPointer = c === 'P';
		cursor.pos += 1;
		if (s[cursor.pos] === 'E') cursor.pos += 1; // __ptr64, present in x64 symbols
		const cvCode = s[cursor.pos];
		cursor.pos += 1;
		const isConst = cvCode === 'B' || cvCode === 'D';
		const inner = parseType(s, cursor);
		const suffix = isPointer ? '*' : '&';
		return isConst ? `${inner} const ${suffix}` : `${inner} ${suffix}`;
	}

	throw new DemangleError(`unsupported type code '${c}' at position ${cursor.pos}`);
}

/**
 * Best-effort demangle of a mangled MSVC member-function symbol into a C++
 * signature string, e.g. "bool Actor::isAlive() const". Returns null for
 * anything outside that common case (see module comment) instead of guessing.
 */
export function demangleMsvc(symbol: string): string | null {
	if (!symbol.startsWith('?')) return null;
	let i = 1;

	if (!/[A-Za-z_]/.test(symbol[i] ?? '')) return null; // bail on operators/ctors/dtors

	const nameStart = i;
	while (symbol[i] !== '@') {
		if (i >= symbol.length) return null;
		i++;
	}
	const funcName = symbol.slice(nameStart, i);
	i++;

	let classPath: string[];
	try {
		const { components, next } = readNameComponents(symbol, i);
		classPath = components;
		i = next;
	} catch {
		return null;
	}

	if (classPath.length === 0) return null; // free functions not supported yet

	const accessChar = symbol[i];
	if (!accessChar) return null;
	const STATIC_CODES = ['C', 'D', 'K', 'L', 'S', 'T'];
	const isStatic = STATIC_CODES.includes(accessChar);
	i++;

	let isConst = false;
	if (!isStatic) {
		if (symbol[i] === 'E') i++; // __ptr64 'this'
		const cvChar = symbol[i];
		isConst = cvChar === 'B' || cvChar === 'D';
		i++; // consume cv char
	}
	i++; // consume calling-convention char

	const cursor: Cursor = { pos: i };
	try {
		let returnType: string;
		if (symbol[cursor.pos] === '?') {
			cursor.pos += 2; // '?' + cv-letter, ignored for by-value returns
		}
		returnType = parseType(symbol, cursor);

		const params: string[] = [];
		if (symbol[cursor.pos] === 'X') {
			cursor.pos++;
		} else {
			while (true) {
				if (cursor.pos >= symbol.length) return null;
				params.push(parseType(symbol, cursor));
				if (symbol[cursor.pos] === '@') {
					cursor.pos++;
					break;
				}
			}
		}
		if (symbol[cursor.pos] !== 'Z') return null;

		const classStr = qualifiedTypeName(classPath);
		const constSuffix = isConst ? ' const' : '';
		return `${returnType} ${classStr}::${funcName}(${params.join(', ')})${constSuffix}`;
	} catch {
		return null;
	}
}
