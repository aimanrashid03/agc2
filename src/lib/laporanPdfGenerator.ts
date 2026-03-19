import fs from 'node:fs';
import path from 'node:path';
import SVGtoPDF from 'svg-to-pdfkit';

interface LaporanPerson {
	id: number;
	role: string | null;
	category: string | null;
	name: string | null;
	email?: string | null;
	phone?: string | null;
	address?: string | null;
	raw_data?: RawDataObject | null;
}

interface LaporanAllegation {
	id: number;
	type: string | null;
	section: string | null;
	act_desc: string | null;
	charge_notes: string | null;
	okt_name: string | null;
	charge_created_date?: string | null;
}

type RawDataObject = Record<string, unknown>;

export interface LaporanCaseData {
	id: number;
	file_no: string | null;
	case_name: string | null;
	court_desc: string | null;
	result: string | null;
	result_date: string | null;
	appeal_date: string | null;
	grounds_of_judgement: string | null;
	case_facts: string | null;
	issues_and_arguments: string | null;
	dpp_suggestion: string | null;
	dsp_suggestion: string | null;
	raw_data?: RawDataObject | null;
	people: LaporanPerson[];
	allegations: LaporanAllegation[];
}

function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function asText(value: unknown, fallback = '-'): string {
	if (typeof value === 'string') {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : fallback;
	}

	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}

	return fallback;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function getNestedValue(source: unknown, path: string[]): unknown {
	let current: unknown = source;

	for (const key of path) {
		if (!isObject(current) || !(key in current)) {
			return undefined;
		}

		current = current[key];
	}

	return current;
}

function toMalayDate(value: unknown): string {
	if (value === null || value === undefined) {
		return '-';
	}

	let source: string;

	if (typeof value === 'string') {
		source = value.trim();
		if (source.length === 0) {
			return '-';
		}
	} else if (value instanceof Date) {
		source = value.toISOString();
	} else if (typeof value === 'number' || typeof value === 'bigint') {
		source = String(value);
	} else {
		return '-';
	}

	if (/^\d{2}\/\d{2}\/\d{4}$/.test(source)) {
		return source;
	}

	const date = new Date(source);
	if (Number.isNaN(date.getTime())) {
		return source;
	}

	const day = String(date.getDate()).padStart(2, '0');
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const year = String(date.getFullYear());
	return `${day}/${month}/${year}`;
}

function getStringWithFallbacks(source: unknown, paths: string[][], fallback = '-'): string {
	for (const candidatePath of paths) {
		const value = asText(getNestedValue(source, candidatePath), '-');
		if (value !== '-') {
			return normalizeWhitespace(value);
		}
	}

	return fallback;
}

function buildOfficeAddress(person: LaporanPerson): string {
	const fromPerson = asText(person.address, '-');
	if (fromPerson !== '-') {
		return normalizeWhitespace(fromPerson);
	}

	const rawAddress = getStringWithFallbacks(person.raw_data, [
		['LTL_DATA', 'officeAddressO'],
		['officeAddressO'],
		['LTL_DATA', 'alamatPejabat'],
		['alamatPejabat'],
		['LTL_DATA', 'address'],
		['address'],
	]);

	const poskod = getStringWithFallbacks(person.raw_data, [['LTL_DATA', 'poskodO'], ['poskodO']], '');
	const daerah = getStringWithFallbacks(person.raw_data, [['LTL_DATA', 'daerahDesc'], ['daerahDesc']], '');
	const negeri = getStringWithFallbacks(person.raw_data, [['LTL_DATA', 'negeriDesc'], ['negeriDesc']], '');

	const suffixParts = [poskod, daerah, negeri]
		.filter((part) => part !== '-' && part.trim().length > 0)
		.map((part) => part.trim());

	if (rawAddress !== '-' && suffixParts.length > 0) {
		return `${rawAddress} ${suffixParts.join(', ')}`;
	}

	return rawAddress;
}

function formatPartyBlock(people: LaporanPerson[], title: string): string {
	if (!people || people.length === 0) {
		return '-';
	}

	return people
		.map((person) => {
			const name = normalizeWhitespace(
				getStringWithFallbacks(
					person,
					[
						['name'],
						['raw_data', 'LTL_DATA', 'namaPerayuResponden'],
						['raw_data', 'LTL_DATA', 'namaPeguamTpr'],
					],
					'-'
				)
			);
			const email = normalizeWhitespace(
				getStringWithFallbacks(
					person,
					[['email'], ['raw_data', 'LTL_DATA', 'emailPerayuResponden']],
					'-'
				)
			);
			const phone = normalizeWhitespace(
				getStringWithFallbacks(
					person,
					[['phone'], ['raw_data', 'LTL_DATA', 'noPhonePerayuResponden']],
					'-'
				)
			);
			const peguam = normalizeWhitespace(
				getStringWithFallbacks(person.raw_data, [['LTL_DATA', 'namaPeguamTpr'], ['namaPeguamTpr']], '-')
			);
			const firma = normalizeWhitespace(
				getStringWithFallbacks(person.raw_data, [['LTL_DATA', 'guamanAgensi'], ['guamanAgensi']], '-')
			);
			const telFirma = normalizeWhitespace(
				getStringWithFallbacks(person.raw_data, [['LTL_DATA', 'officePhoneNoO'], ['officePhoneNoO']], '-')
			);
			const address = buildOfficeAddress(person);
			const peguamLabel = title.toUpperCase() === 'PERAYU' ? 'Peguam/TPR' : 'Peguam';

			return [
				`Nama: ${name}`,
				`Emel: ${email}`,
				`No. Tel: ${phone}`,
				`${peguamLabel}: ${peguam}`,
				`Firma: ${firma}`,
				`No. Tel Firma: ${telFirma}`,
				`Alamat: ${address}`,
			].join('\n');
		})
		.join('\n\n');
}

function buildPertuduhan(allegations: LaporanAllegation[], noFail: string): string {
	if (!allegations || allegations.length === 0) {
		return '-';
	}

	return allegations
		.map((allegation) => {
			const act = asText(allegation.act_desc);
			const section = asText(allegation.section);
			const okt = asText(allegation.okt_name);
			const notes = asText(allegation.charge_notes);

			const lines = [
				`OKT: ${okt}`,
				`No. Kes: ${noFail}`,
				`Akta: ${act}`,
				`Seksyen: ${section}`,
				'Ringkasan:',
				notes === '-' ? '-' : normalizeWhitespace(notes),
			];

			return lines.join('\n');
		})
		.join('\n\n');
}

function buildKorum(people: LaporanPerson[]): string {
	const selected = people.filter(
		(person) =>
			asText(person.category, '').toLowerCase() === 'corum' ||
			asText(person.role, '').toLowerCase().includes('hakim')
	);

	if (selected.length === 0) {
		return '-';
	}

	return selected
		.map((person) => {
			const role = asText(person.role, 'Pesuruhjaya Kehakiman');
			const name = asText(person.name);
			return `${role}: ${name}`;
		})
		.join('\n');
}

function memihakKepada(caseData: LaporanCaseData): string {
	const fromRaw = getNestedValue(caseData.raw_data, ['LKK_DATA', 'memihakKepada']);
	const value = asText(fromRaw, '-');
	if (value !== '-') {
		return value;
	}

	const resultText = asText(caseData.result, '').toLowerCase();
	if (resultText.includes('sabit') || resultText.includes('bersalah')) {
		return 'Pendakwaan';
	}
	if (resultText.includes('lepas') || resultText.includes('bebas')) {
		return 'Responden/OKT';
	}

	return '-';
}

function buildTutupFail(caseData: LaporanCaseData): string {
	const kpiRaw = getNestedValue(caseData.raw_data, ['LKK_DATA', 'MemenuhiKPI']);
	const kpiText = asText(kpiRaw, '-') === '1' ? 'Ya' : asText(kpiRaw, '-') === '0' ? 'Tidak' : '-';
	const keputusan = asText(getNestedValue(caseData.raw_data, ['LKK_DATA', 'keputusanTutup']));
	const catatan = asText(getNestedValue(caseData.raw_data, ['LKK_DATA', 'catatanTutupFail']));
	const tarikh = toMalayDate(asText(getNestedValue(caseData.raw_data, ['LKK_DATA', 'tarikhTutupFail']), '-'));
	const namaPembuat = asText(getNestedValue(caseData.raw_data, ['LKK_DATA', 'staffNameTutupFail']));
	const posisi = asText(getNestedValue(caseData.raw_data, ['LKK_PENGESYOR_STAFFNAME']));
	const unit = asText(getNestedValue(caseData.raw_data, ['LKK_DATA', 'stateDesc']));

	return [
		`Memenuhi KPI: ${kpiText}`,
		`Memihak Kepada: ${memihakKepada(caseData)}`,
		`Keputusan: ${keputusan}`,
		`Catatan: ${catatan}`,
		`Tarikh: ${tarikh}`,
		`Nama Pembuat Laporan: ${namaPembuat}`,
		`Posisi: ${posisi}`,
		`Unit: ${unit}`,
	].join('\n');
}

function buildPerayu(people: LaporanPerson[]): string {
	const selected = people.filter(
		(person) =>
			asText(person.category, '').toLowerCase() === 'prosecutors' ||
			asText(person.role, '').toLowerCase().includes('pendakwa')
	);

	if (selected.length === 0) {
		return '-';
	}

	return formatPartyBlock(selected, 'PERAYU');
}

function buildResponden(people: LaporanPerson[]): string {
	const selected = people.filter(
		(person) =>
			asText(person.category, '').toLowerCase() === 'respondent' ||
			asText(person.category, '').toLowerCase() === 'accused' ||
			asText(person.role, '').toLowerCase().includes('tertuduh')
	);

	if (selected.length === 0) {
		return '-';
	}

	return formatPartyBlock(selected, 'RESPONDEN');
}
export function buildLaporanFieldAudit(caseData: LaporanCaseData) {
	const tarikhHantarAnt =
		asText(getNestedValue(caseData.raw_data, ['LKK_DATA', 'PenerimaLKK', 'datePenerimaLKK']), '-') !== '-'
			? asText(getNestedValue(caseData.raw_data, ['LKK_DATA', 'PenerimaLKK', 'datePenerimaLKK']))
			: asText(getNestedValue(caseData.raw_data, ['LKK_SENDDATE']));

	return {
		namaMahkamah: asText(caseData.court_desc),
		noFail: asText(caseData.file_no),
		namaKes: asText(caseData.case_name),
		perayu: buildPerayu(caseData.people),
		korum: buildKorum(caseData.people),
		responden: buildResponden(caseData.people),
		pertuduhan: buildPertuduhan(caseData.allegations, asText(caseData.file_no)),
		keputusan: asText(caseData.result),
		tarikhKeputusan: toMalayDate(caseData.result_date),
		tarikhFailRayuan: toMalayDate(caseData.appeal_date),
		tarikhDihantarKepadaANT: toMalayDate(tarikhHantarAnt),
		alasanPenghakiman: asText(caseData.grounds_of_judgement),
		latarBelakangDanFaktaKes: asText(caseData.case_facts),
		isuDanHujahan: asText(caseData.issues_and_arguments),
		cadanganTPR: asText(caseData.dpp_suggestion),
		cadanganPPN: asText(caseData.dsp_suggestion),
		tutupFail: buildTutupFail(caseData),
	};
}

let cachedJataSvg: string | null = null;

function getJataSvg(): string | null {
	if (cachedJataSvg) {
		return cachedJataSvg;
	}

	try {
		const svgPath = path.join(process.cwd(), 'templates', 'Jata_MalaysiaV2.svg');
		cachedJataSvg = fs.readFileSync(svgPath, 'utf8');
		return cachedJataSvg;
	} catch {
		// Do not negatively cache misses; the file may appear later while the server keeps running.
		return null;
	}
}

function drawAgencyHeader(doc: PDFKit.PDFDocument, pageWidth: number): void {
	const leftX = doc.page.margins.left;
	const topY = doc.page.margins.top;
	const jataSvg = getJataSvg();

	if (jataSvg) {
		try {
			SVGtoPDF(doc, jataSvg, leftX + 6, topY + 2, {
				width: 62,
				height: 62,
				preserveAspectRatio: 'xMidYMid meet',
			});
		} catch {
			// Continue without logo if SVG rendering is unavailable.
		}
	}

	const logoWidth = 75;
	const textStartX = leftX + logoWidth;
	const textWidth = pageWidth - logoWidth;
	const logoHeight = 62;

	doc.font('Helvetica').fontSize(9).text('JABATAN PEGUAM NEGARA, MALAYSIA', textStartX, topY, {
		align: 'left',
		width: textWidth,
		lineGap: 0,
	});
	doc.font('Helvetica-Oblique').fontSize(8.5).text('(ATTORNEY GENERAL\'S CHAMBERS, MALAYSIA)', textStartX, topY + 11, {
		align: 'left',
		width: textWidth,
		lineGap: 0,
	});
	doc.font('Helvetica').fontSize(8.5).text('NO. 45 , PERSIARAN PERDANA,', textStartX, topY + 22, {
		align: 'left',
		width: textWidth,
		lineGap: 0,
	});
	doc.font('Helvetica').fontSize(8.5).text('PRESINT 4,', textStartX, topY + 31, {
		align: 'left',
		width: textWidth,
		lineGap: 0,
	});
	doc.font('Helvetica').fontSize(8.5).text('62100 PUTRAJAYA', textStartX, topY + 40, {
		align: 'left',
		width: textWidth,
		lineGap: 0,
	});

	doc.y = topY + logoHeight;
	doc.moveDown(0.8);
}

function drawCaseHeading(doc: PDFKit.PDFDocument, pageWidth: number, leftX: number, audit: ReturnType<typeof buildLaporanFieldAudit>): void {
	const noFailLine =
		audit.noFail === '-'
			? '-'
			: /rayuan|jenayah|no\s*:|fail\s*no/i.test(audit.noFail)
				? audit.noFail.toUpperCase()
				: `RAYUAN JENAYAH NO : ${audit.noFail.toUpperCase()}`;

	doc.font('Helvetica-Bold').fontSize(13).text('LAPORAN KEPUTUSAN KES', leftX, doc.y, {
		align: 'center',
		width: pageWidth,
	});
	doc.moveDown(0.6);
	doc.font('Helvetica-Bold').fontSize(10).text(audit.namaMahkamah.toUpperCase(), leftX, doc.y, {
		align: 'center',
		width: pageWidth,
	});
	doc.font('Helvetica-Bold').fontSize(10).text(noFailLine, leftX, doc.y, {
		align: 'center',
		width: pageWidth,
	});
	doc.moveDown(0.8);
	doc.font('Helvetica-Bold').fontSize(10).text(audit.namaKes.toUpperCase(), leftX, doc.y, {
		align: 'center',
		width: pageWidth,
	});
	doc.moveDown(0.8);
}

function drawTwoColumnRow(
	doc: PDFKit.PDFDocument,
	state: { y: number },
	label: string,
	value: string,
	layout: { x: number; right: number; labelWidth: number; bottom: number }
): void {
	const contentWidth = layout.right - layout.x;
	const valueWidth = contentWidth - layout.labelWidth;
	const padding = 6;
	const labelText = label.toUpperCase();
	const valueText = value || '-';
	const valueTextWidth = valueWidth - padding * 2;

	const splitTextToFit = (text: string, maxHeight: number): { chunk: string; rest: string } => {
		const normalized = text.length > 0 ? text : '-';

		if (
			doc.heightOfString(normalized, {
				width: valueTextWidth,
				lineGap: 1,
			}) <= maxHeight
		) {
			return { chunk: normalized, rest: '' };
		}

		let low = 1;
		let high = normalized.length;
		let best = 1;

		while (low <= high) {
			const mid = Math.floor((low + high) / 2);
			const sample = normalized.slice(0, mid);
			const sampleHeight = doc.heightOfString(sample, {
				width: valueTextWidth,
				lineGap: 1,
			});

			if (sampleHeight <= maxHeight) {
				best = mid;
				low = mid + 1;
			} else {
				high = mid - 1;
			}
		}

		let splitAt = best;
		if (splitAt < normalized.length) {
			const breakCandidate = normalized.lastIndexOf(' ', splitAt);
			const lineBreakCandidate = normalized.lastIndexOf('\n', splitAt);
			splitAt = Math.max(breakCandidate, lineBreakCandidate, 1);
		}

		const chunk = normalized.slice(0, splitAt).trimEnd();
		const rest = normalized.slice(splitAt).trimStart();
		return { chunk: chunk.length > 0 ? chunk : normalized.slice(0, 1), rest };
	};

	let remaining = valueText;
	let isFirstChunk = true;

	while (remaining.length > 0) {
		const availableHeight = layout.bottom - state.y - padding * 2;

		if (availableHeight <= 10) {
			doc.addPage();
			state.y = doc.y;
			continue;
		}

		const { chunk, rest } = splitTextToFit(remaining, availableHeight);
		const labelChunkText = isFirstChunk ? labelText : '';

		doc.font('Helvetica-Bold').fontSize(8.5);
		const labelHeight = labelChunkText
			? doc.heightOfString(labelChunkText, {
					width: layout.labelWidth - padding * 2,
				})
			: 0;

		doc.font('Helvetica').fontSize(8.5);
		const valueHeight = doc.heightOfString(chunk, {
			width: valueTextWidth,
			lineGap: 1,
		});

		const rowHeight = Math.max(28, Math.max(labelHeight, valueHeight) + padding * 2);

		doc.save();
		doc.lineWidth(0.38);
		doc.rect(layout.x, state.y, contentWidth, rowHeight).stroke();
		doc.moveTo(layout.x + layout.labelWidth, state.y).lineTo(layout.x + layout.labelWidth, state.y + rowHeight).stroke();
		doc.restore();

		if (labelChunkText) {
			doc.font('Helvetica-Bold').fontSize(8.5).text(labelChunkText, layout.x + padding, state.y + padding, {
				width: layout.labelWidth - padding * 2,
			});
		}

		doc.font('Helvetica').fontSize(8.5).text(chunk, layout.x + layout.labelWidth + padding, state.y + padding, {
			width: valueTextWidth,
			lineGap: 1,
		});

		state.y += rowHeight;
		remaining = rest;
		isFirstChunk = false;

		if (remaining.length > 0) {
			doc.addPage();
			state.y = doc.y;
		}
	}
}

function drawSingleColumnRow(
	doc: PDFKit.PDFDocument,
	state: { y: number },
	label: string,
	value: string,
	layout: { x: number; right: number; bottom: number }
): void {
	const contentWidth = layout.right - layout.x;
	const padding = 6;
	const labelText = label.toUpperCase();
	const valueText = value || '-';
	const textWidth = contentWidth - padding * 2;

	// Draw label cell
	const labelRowHeight = 24;
	doc.save();
	doc.lineWidth(0.38);
	doc.rect(layout.x, state.y, contentWidth, labelRowHeight).stroke();
	doc.restore();

	doc.font('Helvetica-Bold').fontSize(8.5).text(labelText, layout.x + padding, state.y + padding, {
		width: textWidth,
	});

	state.y += labelRowHeight;

	// Draw data cell with text wrapping
	const splitTextToFit = (text: string, maxHeight: number): { chunk: string; rest: string } => {
		const normalized = text.length > 0 ? text : '-';

		if (
			doc.heightOfString(normalized, {
				width: textWidth,
				lineGap: 1,
			}) <= maxHeight
		) {
			return { chunk: normalized, rest: '' };
		}

		let low = 1;
		let high = normalized.length;
		let best = 1;

		while (low <= high) {
			const mid = Math.floor((low + high) / 2);
			const sample = normalized.slice(0, mid);
			const sampleHeight = doc.heightOfString(sample, {
				width: textWidth,
				lineGap: 1,
			});

			if (sampleHeight <= maxHeight) {
				best = mid;
				low = mid + 1;
			} else {
				high = mid - 1;
			}
		}

		let splitAt = best;
		if (splitAt < normalized.length) {
			const breakCandidate = normalized.lastIndexOf(' ', splitAt);
			const lineBreakCandidate = normalized.lastIndexOf('\n', splitAt);
			splitAt = Math.max(breakCandidate, lineBreakCandidate, 1);
		}

		const chunk = normalized.slice(0, splitAt).trimEnd();
		const rest = normalized.slice(splitAt).trimStart();
		return { chunk: chunk.length > 0 ? chunk : normalized.slice(0, 1), rest };
	};

	let remaining = valueText;

	while (remaining.length > 0) {
		const availableHeight = layout.bottom - state.y - padding * 2;

		if (availableHeight <= 10) {
			doc.addPage();
			state.y = doc.y;
			continue;
		}

		const { chunk, rest } = splitTextToFit(remaining, availableHeight);

		doc.font('Helvetica').fontSize(8.5);
		const valueHeight = doc.heightOfString(chunk, {
			width: textWidth,
			lineGap: 1,
		});

		const rowHeight = padding + valueHeight + padding;

		doc.save();
		doc.lineWidth(0.38);
		doc.rect(layout.x, state.y, contentWidth, rowHeight).stroke();
		doc.restore();

		doc.font('Helvetica').fontSize(8.5).text(chunk, layout.x + padding, state.y + padding, {
			width: textWidth,
			lineGap: 1,
		});

		state.y += rowHeight;
		remaining = rest;

		if (remaining.length > 0) {
			doc.addPage();
			state.y = doc.y;
		}
	}
}

export async function generateLaporanPdf(caseData: LaporanCaseData): Promise<Buffer> {
	const { default: PDFDocument } = await import('pdfkit/js/pdfkit.standalone.js');
	const audit = buildLaporanFieldAudit(caseData);

	return new Promise<Buffer>((resolve, reject) => {
		const doc = new PDFDocument({
			size: 'A4',
			bufferPages: true,
			margins: {
				top: 56,
				left: 60,
				right: 60,
				bottom: 72,
			},
			info: {
				Title: `Laporan Keputusan Kes - ${asText(caseData.file_no, 'Kes')}`,
				Author: 'Jabatan Peguam Negara',
			},
		});

		const chunks: Buffer[] = [];

		doc.on('data', (chunk: Uint8Array) => chunks.push(Buffer.from(chunk)));
		doc.on('error', (error: Error) => reject(error));

		const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
		const x = doc.page.margins.left;
		const right = doc.page.width - doc.page.margins.right;
		const footerHeight = 36;
		const bottom = doc.page.height - doc.page.margins.bottom - footerHeight;
		let firstPageHeaderDone = false;

		doc.on('pageAdded', () => {
			if (!firstPageHeaderDone) {
				return;
			}

			doc.y = doc.page.margins.top;
			drawAgencyHeader(doc, pageWidth);
		});

		drawAgencyHeader(doc, pageWidth);
		drawCaseHeading(doc, pageWidth, x, audit);
		firstPageHeaderDone = true;

		const state = { y: doc.y };
		const tableLayout = { x, right, labelWidth: 140, bottom };
		const singleColumnLayout = { x, right, bottom };

		drawTwoColumnRow(doc, state, 'Korum', audit.korum, tableLayout);
		drawTwoColumnRow(doc, state, 'Perayu', audit.perayu, tableLayout);
		drawTwoColumnRow(doc, state, 'Responden', audit.responden, tableLayout);
		drawTwoColumnRow(doc, state, 'Pertuduhan', audit.pertuduhan, tableLayout);
		drawSingleColumnRow(doc, state, 'Keputusan', audit.keputusan, singleColumnLayout);
		drawTwoColumnRow(doc, state, 'Tarikh Keputusan', audit.tarikhKeputusan, tableLayout);
		drawTwoColumnRow(doc, state, 'Tarikh Fail Rayuan', audit.tarikhFailRayuan, tableLayout);
		drawTwoColumnRow(doc, state, 'Tarikh Hantar ANT', audit.tarikhDihantarKepadaANT, tableLayout);
		drawSingleColumnRow(doc, state, 'Alasan Penghakiman', audit.alasanPenghakiman, singleColumnLayout);
		drawSingleColumnRow(doc, state, 'Latar Belakang dan Fakta Kes', audit.latarBelakangDanFaktaKes, singleColumnLayout);
		drawSingleColumnRow(doc, state, 'Isu Yang Dibangkitkan dan Hujahan', audit.isuDanHujahan, singleColumnLayout);
		drawSingleColumnRow(doc, state, 'Cadangan TPR', audit.cadanganTPR, singleColumnLayout);
		drawSingleColumnRow(doc, state, 'Cadangan PPN', audit.cadanganPPN, singleColumnLayout);
		drawSingleColumnRow(doc, state, 'Tutup Fail', audit.tutupFail, singleColumnLayout);

		// Add page numbers to all pages before finalizing
		const range = doc.bufferedPageRange();
		for (let i = 0; i < range.count; i += 1) {
			const pageIndex = range.start + i;
			doc.switchToPage(pageIndex);
			const pageText = `${i + 1}/${range.count}`;
			doc.font('Helvetica-Oblique').fontSize(8);
			const pageTextWidth = doc.widthOfString(pageText);
			const pageX = (doc.page.width - pageTextWidth) / 2;
			const pageY = doc.page.height - 33;
			doc.text(pageText, pageX, pageY, {
				lineBreak: false,
			});
		}

		// Now add the end handler and finalize
		doc.on('end', () => {
			resolve(Buffer.concat(chunks));
		});

		doc.end();
	});
}
