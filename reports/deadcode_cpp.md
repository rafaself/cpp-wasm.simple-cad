# C++ Dead Code Report
Generated: 2025-12-29T18:37:46-03:00

### nm --defined-only (first 50 symbols)
Command: `nm -C --defined-only "/home/rafa/dev/eletrocad-webapp/cpp/build_native/engine_tests" | head -n 50`
Exit code: 0

```
0000000000171fe4 t BDF_Face_Done
000000000017213b t BDF_Face_Init
0000000000172ee3 t BDF_Glyph_Load
0000000000172dc2 t BDF_Size_Request
0000000000172d30 t BDF_Size_Select
00000000001a6881 t Bezier_Down
00000000001a6519 t Bezier_Up
0000000000186527 t BitOrderInvert
0000000000178cd6 t CFF_Done_FD_Select
0000000000178d2e t CFF_Load_FD_Select
00000000001dd82b t Compute_Funcs
00000000001e1321 t Compute_Point_Displacement
00000000001dd454 t Compute_Round
00000000001a6cef t Conic_To
00000000001a7e53 t Convert_Glyph
00000000001a70c2 t Cubic_To
00000000001dc40b t Current_Ppem
00000000001dc427 t Current_Ppem_Stretched
00000000001dc31d t Current_Ratio
000000000064a800 V DW.ref._ZTIN7testing18AssertionExceptionE
000000000064a808 V DW.ref._ZTIN7testing8internal26GoogleTestFailureExceptionE
000000000064a810 V DW.ref._ZTISt9exception
000000000064a010 V DW.ref.__gxx_personality_v0
00000000001a7524 t Decompose_Curve
00000000001a81b6 t DelOld
000000000044eff7 W DeleteThreadLocalValue
000000000015fdd6 t Destroy_Driver
0000000000165369 t Destroy_Module
00000000001dc927 t Direct_Move
00000000001dcb53 t Direct_Move_Orig
00000000001dce0d t Direct_Move_Orig_X
00000000001dce64 t Direct_Move_Orig_Y
00000000001dcc57 t Direct_Move_X
00000000001dcd4b t Direct_Move_Y
00000000001a8e54 t Draw_Sweep
00000000001dd7ac t Dual_Project
00000000001a59fb t End_Profile
00000000001f86de t FNT_Face_Done
00000000001f874b t FNT_Face_Init
00000000001f8f53 t FNT_Load_Glyph
00000000001f8e33 t FNT_Size_Request
00000000001f8d8c t FNT_Size_Select
0000000000164b06 T FT_Activate_Size
000000000016c5ca T FT_Add_Default_Modules
000000000016543b T FT_Add_Module
000000000016bd5b T FT_Angle_Diff
000000000016b8c4 T FT_Atan2
0000000000162151 T FT_Attach_File
00000000001621c2 T FT_Attach_Stream
000000000020a519 T FT_Bitmap_Blend
```

### nm --undefined (first 50 symbols)
Command: `nm -C --undefined-only "/home/rafa/dev/eletrocad-webapp/cpp/build_native/engine_tests" | head -n 50`
Exit code: 0

```
                 U _Exit@GLIBC_2.2.5
                 w _ITM_deregisterTMCloneTable
                 w _ITM_registerTMCloneTable
                 U _Unwind_Resume@GCC_3.0
                 U std::__cxx11::basic_stringstream<char, std::char_traits<char>, std::allocator<char> >::str() const &@GLIBCXX_3.4.29
                 U std::__cxx11::basic_ostringstream<char, std::char_traits<char>, std::allocator<char> >::str() const &@GLIBCXX_3.4.29
                 U std::runtime_error::what() const@GLIBCXX_3.4
                 U std::__detail::_Prime_rehash_policy::_M_next_bkt(unsigned long) const@GLIBCXX_3.4.18
                 U std::__detail::_Prime_rehash_policy::_M_need_rehash(unsigned long, unsigned long, unsigned long) const@GLIBCXX_3.4.18
                 U std::basic_ios<char, std::char_traits<char> >::operator bool() const@GLIBCXX_3.4.21
                 U std::basic_ios<char, std::char_traits<char> >::operator!() const@GLIBCXX_3.4
                 U std::istream::read(char*, long)@GLIBCXX_3.4
                 U std::istream::seekg(long, std::_Ios_Seekdir)@GLIBCXX_3.4
                 U std::istream::tellg()@GLIBCXX_3.4
                 U std::istream::operator>>(unsigned long&)@GLIBCXX_3.4
                 U std::ostream::write(char const*, long)@GLIBCXX_3.4
                 U std::ostream::operator<<(std::ostream& (*)(std::ostream&))@GLIBCXX_3.4
                 U std::ostream::operator<<(std::ios_base& (*)(std::ios_base&))@GLIBCXX_3.4
                 U std::ostream::operator<<(void const*)@GLIBCXX_3.4
                 U std::ostream::operator<<(double)@GLIBCXX_3.4
                 U std::ostream::operator<<(float)@GLIBCXX_3.4
                 U std::ostream::operator<<(int)@GLIBCXX_3.4
                 U std::ostream::operator<<(unsigned int)@GLIBCXX_3.4
                 U std::ostream::operator<<(long)@GLIBCXX_3.4
                 U std::ostream::operator<<(unsigned long)@GLIBCXX_3.4
                 U std::ostream::operator<<(unsigned short)@GLIBCXX_3.4
                 U std::runtime_error::runtime_error(char const*)@GLIBCXX_3.4.21
                 U std::runtime_error::~runtime_error()@GLIBCXX_3.4
                 U std::basic_ifstream<char, std::char_traits<char> >::is_open()@GLIBCXX_3.4
                 U std::basic_ifstream<char, std::char_traits<char> >::basic_ifstream(char const*, std::_Ios_Openmode)@GLIBCXX_3.4
                 U std::basic_ifstream<char, std::char_traits<char> >::basic_ifstream(std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char> > const&, std::_Ios_Openmode)@GLIBCXX_3.4.21
                 U std::basic_ifstream<char, std::char_traits<char> >::~basic_ifstream()@GLIBCXX_3.4
                 U std::chrono::_V2::steady_clock::now()@GLIBCXX_3.4.19
                 U std::chrono::_V2::system_clock::now()@GLIBCXX_3.4.19
                 U std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char> >::_M_replace_cold(char*, unsigned long, char const*, unsigned long, unsigned long)@GLIBCXX_3.4.31
                 U std::__cxx11::basic_stringstream<char, std::char_traits<char>, std::allocator<char> >::basic_stringstream()@GLIBCXX_3.4.26
                 U std::__cxx11::basic_stringstream<char, std::char_traits<char>, std::allocator<char> >::~basic_stringstream()@GLIBCXX_3.4.21
                 U std::__cxx11::basic_ostringstream<char, std::char_traits<char>, std::allocator<char> >::basic_ostringstream()@GLIBCXX_3.4.26
                 U std::__cxx11::basic_ostringstream<char, std::char_traits<char>, std::allocator<char> >::~basic_ostringstream()@GLIBCXX_3.4.21
                 U std::__detail::_List_node_base::_M_transfer(std::__detail::_List_node_base*, std::__detail::_List_node_base*)@GLIBCXX_3.4.15
                 U std::__detail::_List_node_base::_M_hook(std::__detail::_List_node_base*)@GLIBCXX_3.4.15
                 U std::_Hash_bytes(void const*, unsigned long, unsigned long)@CXXABI_1.3.5
                 U std::__throw_bad_alloc()@GLIBCXX_3.4
                 U std::_Rb_tree_decrement(std::_Rb_tree_node_base*)@GLIBCXX_3.4
                 U std::_Rb_tree_increment(std::_Rb_tree_node_base const*)@GLIBCXX_3.4
                 U std::_Rb_tree_increment(std::_Rb_tree_node_base*)@GLIBCXX_3.4
                 U std::__throw_logic_error(char const*)@GLIBCXX_3.4
                 U std::__throw_length_error(char const*)@GLIBCXX_3.4
                 U std::__throw_out_of_range(char const*)@GLIBCXX_3.4
                 U std::ios_base_library_init()@GLIBCXX_3.4.32
```

### objdump -t (text section, first 50)
Command: `objdump -t "/home/rafa/dev/eletrocad-webapp/cpp/build_native/engine_tests" | grep '\.text' | head -n 50`
Exit code: 0

```
0000000000025a80 l     F .text	0000000000000000              deregister_tm_clones
0000000000025ab0 l     F .text	0000000000000000              register_tm_clones
0000000000025af0 l     F .text	0000000000000000              __do_global_dtors_aux
0000000000025b30 l     F .text	0000000000000000              frame_dummy
00000000000262b0 l     F .text	0000000000000090              _ZZN37CadEngineTest_CommandBufferCycle_Test8TestBodyEvENKUljE_clEj
0000000000026340 l     F .text	0000000000000092              _ZZN37CadEngineTest_CommandBufferCycle_Test8TestBodyEvENKUlfE_clEf
000000000002899c l     F .text	0000000000000090              _ZZN37CadEngineTest_CommandBufferError_Test8TestBodyEvENKUljE_clEj
0000000000028ec6 l     F .text	0000000000000a6e              _Z41__static_initialization_and_destruction_0v
0000000000029934 l     F .text	000000000000000f              _GLOBAL__sub_I__ZN31CadEngineTest_InitialState_Test10test_info_E
0000000000030776 l     F .text	0000000000000038              _ZL2cbPvjjPKhj
00000000000307ae l     F .text	0000000000000090              _ZZN29CommandsTest_ParseSingle_Test8TestBodyEvENKUljE_clEj
0000000000030b7b l     F .text	0000000000000203              _Z41__static_initialization_and_destruction_0v
0000000000030d7e l     F .text	000000000000000f              _GLOBAL__sub_I__ZN29CommandsTest_ParseSingle_Test10test_info_E
0000000000032cf3 l     F .text	0000000000000203              _Z41__static_initialization_and_destruction_0v
0000000000032ef6 l     F .text	000000000000000f              _GLOBAL__sub_I__ZN27SnapshotTest_RoundTrip_Test10test_info_E
000000000003d275 l     F .text	0000000000000203              _Z41__static_initialization_and_destruction_0v
000000000003d478 l     F .text	000000000000000f              _GLOBAL__sub_I__ZN29RenderTest_SimpleBuffers_Test10test_info_E
000000000004242b l     F .text	00000000000003b2              _Z41__static_initialization_and_destruction_0v
00000000000427dd l     F .text	000000000000000f              _GLOBAL__sub_I__ZN45LayerFlagsTest_InvisibleLayerNotRendered_Test10test_info_E
000000000004452a l     F .text	0000000000000561              _Z41__static_initialization_and_destruction_0v
0000000000044a8b l     F .text	000000000000000f              _GLOBAL__sub_I__ZN49SelectionStateTest_FiltersLockedAndInvisible_Test10test_info_E
00000000000454c6 l     F .text	00000000000000b9              _ZN12_GLOBAL__N_1L12hasNonFiniteERKSt6vectorIfSaIfEE
0000000000046aac l     F .text	0000000000000561              _Z41__static_initialization_and_destruction_0v
000000000004700d l     F .text	000000000000000f              _GLOBAL__sub_I__ZN51VectorTessellationTest_StrokeQuadraticFlattens_Test10test_info_E
000000000004d501 l     F .text	0000000000000203              _Z41__static_initialization_and_destruction_0v
000000000004d704 l     F .text	000000000000000f              _GLOBAL__sub_I__ZN38ProtocolInfoTest_NonZeroAndStable_Test10test_info_E
000000000004efbf l     F .text	0000000000000561              _Z41__static_initialization_and_destruction_0v
000000000004f520 l     F .text	000000000000000f              _GLOBAL__sub_I__ZN43EventStreamTest_CoalescesEntityChanges_Test10test_info_E
0000000000052121 l     F .text	0000000000000203              _Z41__static_initialization_and_destruction_0v
0000000000052324 l     F .text	000000000000000f              _GLOBAL__sub_I__ZN48OverlayQueryTest_SelectionOutlineAndHandles_Test10test_info_E
00000000000536e2 l     F .text	0000000000000203              _Z41__static_initialization_and_destruction_0v
00000000000538e5 l     F .text	000000000000000f              _GLOBAL__sub_I__ZN66InteractiveTransformPerfTest_UpdateTransformDoesNotRebuildAll_Test10test_info_E
0000000000053a70 l     F .text	0000000000000031              _ZN12_GLOBAL__N_18findRectERK9CadEnginej
0000000000055307 l     F .text	00000000000003b2              _Z41__static_initialization_and_destruction_0v
00000000000556b9 l     F .text	000000000000000f              _GLOBAL__sub_I__ZN33HistoryTest_UndoRedoSequence_Test10test_info_E
000000000005eedc l     F .text	0000000000003e9f              _Z41__static_initialization_and_destruction_0v
0000000000062d7b l     F .text	000000000000000f              _GLOBAL__sub_I__ZN29TextStoreTest_CreateText_Test10test_info_E
00000000000754b7 l     F .text	000000000000404e              _Z41__static_initialization_and_destruction_0v
0000000000079505 l     F .text	000000000000000f              _GLOBAL__sub_I__ZN45TextLayoutTest_FontManagerInitialization_Test10test_info_E
000000000008ba4f l     F .text	0000000000002c1a              _Z41__static_initialization_and_destruction_0v
000000000008e669 l     F .text	000000000000000f              _GLOBAL__sub_I__ZN33AtlasPackerTest_Construction_Test10test_info_E
00000000000a2abd l     F .text	000000000000255e              _Z41__static_initialization_and_destruction_0v
00000000000a501b l     F .text	000000000000000f              _GLOBAL__sub_I__ZN39TextCommandsTest_UpsertText_Simple_Test10test_info_E
00000000000ae3c2 l     F .text	0000000000000561              _Z41__static_initialization_and_destruction_0v
00000000000ae923 l     F .text	000000000000000f              _GLOBAL__sub_I__ZN56TextCoordinateSystemTest_LineVerticalProgressionYUp_Test10test_info_E
00000000000af6ce l     F .text	0000000000000048              _ZN12_GLOBAL__N_129isEntityVisibleForRenderThunkEPvj
00000000000afc88 l     F .text	000000000000003c              _ZZN9CadEngine18applyCommandBufferEmjENKUlPvjjPKhjE_clES0_jjS2_j
00000000000afcc4 l     F .text	0000000000000044              _ZZN9CadEngine18applyCommandBufferEmjENUlPvjjPKhjE_4_FUNES0_jjS2_j
00000000000afd08 l     F .text	0000000000000011              _ZZN9CadEngine18applyCommandBufferEmjENKUlPvjjPKhjE_cvPF11EngineErrorS0_jjS2_jEEv
00000000000bc8a5 l     F .text	0000000000000048              _ZL7readU32PKhm
grep: write error: Broken pipe
```

### rg hints ("unused" tokens in cpp/engine)
Command: `cd "/home/rafa/dev/eletrocad-webapp" && rg --no-heading --line-number "unused" cpp/engine`
Exit code: 0

```
cpp/engine/impl/engine_render.cpp:24:    // This overload is likely deprecated or unused for internal logic now, 
cpp/engine/render/render.cpp:557:    (void)viewScale; // Stroke widths now live in world space, so view scale is unused.
```

