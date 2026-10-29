// Numeric synthetic buffers only: no SVG/image parser, file conversion or renderer.
extern crate self as rgb;
#[repr(C)]
#[derive(Clone, Copy, Default, Debug, PartialEq, Eq)]
pub struct RGBA8 { pub r: u8, pub g: u8, pub b: u8, pub a: u8 }
pub struct ImageRefMut<'a> { data: &'a mut [RGBA8], width: u32, height: u32 }
impl<'a> ImageRefMut<'a> {
    fn new(width: u32, height: u32, data: &'a mut [RGBA8]) -> Self { Self { data, width, height } }
}
#[path = "original-box-blur.rs"] mod original;
#[path = "patched-box-blur.rs"] mod patched;

fn original_on_extended_domain(input: &[RGBA8], width: usize, height: usize, sx: f64, sy: f64) -> Vec<RGBA8> {
    // Deliberately more than the total 21-pixel support at sigma6, so no
    // intermediate convolution tail reaches the artificial outer boundary.
    let pad_x = if sx == 0.0 { 0 } else { 48 };
    let pad_y = if sy == 0.0 { 0 } else { 48 };
    let ew = width + pad_x * 2; let eh = height + pad_y * 2;
    let mut expanded = vec![RGBA8::default(); ew * eh];
    for y in 0..height { expanded[(y+pad_y)*ew+pad_x..(y+pad_y)*ew+pad_x+width]
        .copy_from_slice(&input[y*width..(y+1)*width]); }
    original::apply(sx, sy, ImageRefMut::new(ew as u32, eh as u32, &mut expanded));
    let mut output = Vec::with_capacity(width*height);
    for y in 0..height { output.extend_from_slice(&expanded[(y+pad_y)*ew+pad_x..(y+pad_y)*ew+pad_x+width]); }
    output
}

#[test]
fn fixed_window_negative_control_loses_boundary_values_but_center_is_unchanged() {
    let input = vec![RGBA8 { r: 0, g: 0, b: 0, a: 255 }; 64];
    let mut cropped = input.clone(); let mut corrected = input.clone();
    original::apply(6.0, 0.0, ImageRefMut::new(64, 1, &mut cropped));
    patched::apply(6.0, 0.0, ImageRefMut::new(64, 1, &mut corrected));
    let oracle = original_on_extended_domain(&input, 64, 1, 6.0, 0.0);
    assert_eq!(corrected, oracle); assert_eq!(cropped[0].a, 79); assert_eq!(corrected[0].a, 136);
    let maximum_difference = cropped.iter().zip(&corrected).map(|(a,b)| (a.a as i16-b.a as i16).abs()).max().unwrap();
    assert_eq!(maximum_difference, 57); assert_eq!(cropped[32], corrected[32]);
    println!("boundary-observation old={} expanded={} max={} center={}", cropped[0].a, corrected[0].a, maximum_difference, corrected[32].a);
}

#[test]
fn every_rgba_channel_matches_the_unchanged_kernel_on_a_larger_zero_extended_domain() {
    for (width, height) in [(1,1), (3,2), (47,19), (64,64)] {
        let input: Vec<_> = (0..width*height).map(|i| {
            let a = ((i*17+83)%256) as u8; RGBA8 { r:a/2, g:a/4, b:a/8, a }
        }).collect();
        for (sx,sy) in [(6.0,6.0), (6.0,0.0), (0.0,6.0), (0.0,0.0)] {
            let oracle = original_on_extended_domain(&input,width,height,sx,sy);
            let mut actual = input.clone();
            patched::apply(sx,sy,ImageRefMut::new(width as u32,height as u32,&mut actual));
            assert_eq!(actual,oracle,"{}x{} sigma{},{}",width,height,sx,sy);
            assert!(actual.iter().all(|p| p.r<=p.a && p.g<=p.a && p.b<=p.a));
        }
    }
}

#[test]
#[should_panic(expected="bounded blur halo buffers exceed 96 MiB")]
fn oversized_extent_is_rejected_before_any_large_temporary_allocation() {
    let mut empty = [];
    patched::apply(6.0,6.0,ImageRefMut::new(5000,5000,&mut empty));
}

#[test]
fn sigma6_viewport_halo_footprint_is_explicit_and_does_not_raise_the_wasm_cap() {
    let padding = 4u64*4+5; assert_eq!(padding,21);
    let pixels = (3000+2*padding)*(224+2*padding);
    let expanded_temporary_bytes = 2*pixels*4;
    assert_eq!(pixels,809172); assert_eq!(expanded_temporary_bytes,6473376);
    assert!(expanded_temporary_bytes < 8*1024*1024);
    assert_eq!(96*1024*1024,100663296);
    println!("halo-footprint padding={} expanded-temporary-bytes={} wasm-cap={}",padding,expanded_temporary_bytes,100663296);
}
