// Private transfer-order candidate. Fixed lookup payload; no file/image I/O.
use std::sync::OnceLock;
static WITHIN_TO_LINEAR: OnceLock<[u8; 65536]> = OnceLock::new();
static WITHIN_TO_SRGB: OnceLock<[u8; 65536]> = OnceLock::new();

fn within_transfer_channel(value: u8, alpha: u8, to_linear: bool) -> u8 {
    if alpha == 0 { return 0; }
    let straight = value.min(alpha) as f64 / alpha as f64;
    let converted = if to_linear {
        if straight <= 0.04045 { straight / 12.92 }
        else { ((straight + 0.055) / 1.055).powf(2.4) }
    } else if straight <= 0.0031308 { straight * 12.92 }
        else { 1.055 * straight.powf(1.0 / 2.4) - 0.055 };
    // Quantize premultiplied channels once, not the straight intermediate first.
    ((converted * alpha as f64 + 0.5) as u8).min(alpha)
}

fn within_transfer_table(to_linear: bool) -> &'static [u8; 65536] {
    let table = if to_linear { &WITHIN_TO_LINEAR } else { &WITHIN_TO_SRGB };
    table.get_or_init(|| {
        let mut values = [0u8; 65536];
        for alpha in 0..=255u8 {
            for value in 0..=255u8 {
                values[(alpha as usize) * 256 + value as usize] = within_transfer_channel(value, alpha, to_linear);
            }
        }
        values
    })
}

fn within_convert_premultiplied(data: &mut [u8], to_linear: bool) {
    debug_assert_eq!(data.len() % 4, 0);
    let table = within_transfer_table(to_linear);
    for pixel in data.chunks_exact_mut(4) {
        let row = pixel[3] as usize * 256;
        for channel in &mut pixel[..3] { *channel = table[row + *channel as usize]; }
    }
}

#[cfg(test)]
mod within_premultiplied_transfer_tests {
    use super::*;
    #[test]
    fn opacity_signature_models_have_the_predicted_channel_rounding() {
        for (mut input, expected) in [([8,18,29,255],[1,2,3,255]),
            ([5,12,19,166],[0,1,2,166]),([7,16,26,230],[1,1,3,230])] {
            within_convert_premultiplied(&mut input, true); assert_eq!(input, expected);
        }
        let mut input = [0,1,2,166]; within_convert_premultiplied(&mut input, false);
        assert_eq!(input, [0,12,19,166]);
    }
    #[test]
    fn all_lookup_entries_match_scalar_transfer_and_preserve_premultiplied_bounds() {
        for direction in [true, false] {
            let table = within_transfer_table(direction);
            for alpha in 0..=255u8 {
                let mut previous = 0;
                for value in 0..=255u8 {
                    let result = table[alpha as usize * 256 + value as usize];
                    assert_eq!(result, within_transfer_channel(value, alpha, direction));
                    assert!(result <= alpha); assert!(result >= previous); previous = result;
                }
            }
        }
    }
    #[test]
    fn opaque_rows_match_both_pinned_original_tables_exactly() {
        let mut checksum = 0xcbf29ce484222325u64;
        for direction in [true, false] {
            for &value in &within_transfer_table(direction)[65280..65536] {
                checksum = (checksum ^ value as u64).wrapping_mul(0x100000001b3);
            }
        }
        assert_eq!(checksum, 0xfdf3527d10047e2c); // Fingerprint of both pinned original opaque tables.
    }
    #[test]
    fn tables_are_reused_and_payload_is_fixed_independent_of_input_size() {
        let first = within_transfer_table(true).as_ptr();
        let mut data = [0,0,0,0,8,18,29,255,5,12,19,166];
        within_convert_premultiplied(&mut data, true);
        assert_eq!(within_transfer_table(true).as_ptr(), first);
        assert_eq!(&data[..4], &[0,0,0,0]); assert_eq!(data[7],255); assert_eq!(data[11],166);
        assert_eq!(std::mem::size_of::<[u8; 65536]>() * 2, 131072);
        assert!(std::mem::size_of::<OnceLock<[u8; 65536]>>() * 2 <= 131104);
    }
}
