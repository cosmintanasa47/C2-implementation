// octave_calcs.cpp
// Toate calculele prin Octave API:
//   1. Interpolare traiectorie          -> interp1
//   2. Predictie trend (regresie liniara) -> polyfit
//   3. Pret / risc                       -> formula
//   4. Distanta la cel mai apropiat punct critic -> pdist2
//
// Compilare: mkoctfile --link-stand-alone octave_calcs.cpp -o octave_calcs
// Rulare:    ./octave_calcs
//
// Necesita pachetul statistics pentru pdist2:
//   In Octave: pkg install -forge statistics
//   In cod se incarca automat cu "pkg load statistics".

#include <iostream>
#include <vector>
#include <string>
#include <cmath>
#include <stdexcept>
#include <limits>

#include <octave/oct.h>
#include <octave/octave.h>
#include <octave/parse.h>
#include <octave/interpreter.h>

/* LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu/octave/11.1.0:$LD_LIBRARY_PATH ./math to compile

You can use this enywhere else using:

init_octave();

// exemplu 1: interpolare
auto ir = interpolate_trajectory(t_vec, lat_vec, lon_vec, 0.5, "spline");

// exemplu 2: trend
auto tr = predict_trend(t_vec, lat_vec, lon_vec, 10.0);

// exemplu 3: distanta la cel mai apropiat punct critic
auto nr = distance_to_nearest_critical(drone_lat, drone_lon, crit_lat, crit_lon);

// exemplu 4: pret / risc
double price = compute_risk_price(nr.distance_m, 6.0, 15.3);

shutdown_octave();

*/

// ============================================================
//  Sesiune Octave (singleton)
// ============================================================
class OctaveSession {
    octave::interpreter interp_;
    bool active_ = false;
public:
    OctaveSession() {
        interp_.execute();
        active_ = true;
    }
    ~OctaveSession() {
        //if (active_) {
         //   try { interp_.shutdown(); } catch (...) {}
       // }W
    }
    octave::interpreter& get() { return interp_; }
};

static OctaveSession* g_session = nullptr;

static octave::interpreter& session() {
    if (!g_session)
        throw std::runtime_error("Octave neinitializat. Apeleaza init_octave().");
    return g_session->get();
}

// ============================================================
//  Helper: std::vector<double> -> Matrix coloana
// ============================================================
static Matrix vec2col(const std::vector<double>& v) {
    Matrix m(v.size(), 1);
    for (size_t i = 0; i < v.size(); ++i) m(i, 0) = v[i];
    return m;
}

// ============================================================
//  INIT / SHUTDOWN
// ============================================================
void init_octave() {
    if (g_session) return;
    g_session = new OctaveSession();
    octave::interpreter& interp = g_session->get();

    // Incarca pachetul statistics (pentru pdist2).
    // Daca nu e instalat, afiseaza un warning dar continua.
    try {
        interp.eval("pkg load statistics;", 0);
    } catch (const std::exception& e) {
        std::cerr << "Warning: nu am putut incarca pachetul statistics ("
                  << e.what() << "). pdist2 nu va fi disponibil.\n";
    }

    // Definim toate functiile Octave o singura data.
    interp.eval(R"(
        % ---- 1. Interpolare traiectorie ----
        function [lat_out, lon_out] = traj_interp(t_in, lat_in, lon_in, t_out, method)
            lat_out = interp1(t_in, lat_in, t_out, method);
            lon_out = interp1(t_in, lon_in, t_out, method);
        end

        % ---- 2. Predictie trend (regresie liniara) ----
        function [lat_pred, lon_pred, vlat, vlon] = traj_trend(t_in, lat_in, lon_in, t_future)
            p_lat = polyfit(t_in, lat_in, 1);
            p_lon = polyfit(t_in, lon_in, 1);
            vlat = p_lat(1); clat = p_lat(2);
            vlon = p_lon(1); clon = p_lon(2);
            lat_pred = vlat * t_future + clat;
            lon_pred = vlon * t_future + clon;
        end

        % ---- 3. Pret / risc ----
        function price = risk_price(distance_m, importance, speed_mps)
            price = distance_m * importance * speed_mps;
        end

        % ---- 4. Distanta la cel mai apropiat punct critic (cu pdist2) ----
        % Proiecteaza coordonatele in metri planari locali (equirectangular),
        % apoi foloseste pdist2 pentru distante euclidiene.
        function [idx, dmin] = nearest_crit(dlat, dlon, crit_lat, crit_lon)
            R   = 6371000.0;
            DEG = pi/180;
            lat0 = dlat;   % referinta locala

            % proiectie in metri
            x_c = crit_lon * DEG * R * cos(lat0 * DEG);
            y_c = crit_lat * DEG * R;
            x_d = dlon     * DEG * R * cos(lat0 * DEG);
            y_d = dlat     * DEG * R;

            % pdist2 intre drona (1 punct) si toate punctele critice
            D = pdist2([x_d, y_d], [x_c, y_c]);

            [dmin, idx] = min(D);
        end
    )", 0);
}

void shutdown_octave() {
    delete g_session;
    g_session = nullptr;
}

// ============================================================
//  1. INTERPOLARE TRAIECTORIE
// ============================================================
struct InterpResult {
    std::vector<double> t;
    std::vector<double> lat;
    std::vector<double> lon;
};

InterpResult interpolate_trajectory(
    const std::vector<double>& t_in,
    const std::vector<double>& lat_in,
    const std::vector<double>& lon_in,
    double dt,
    const std::string& method = "spline")
{
    if (t_in.size() < 2 ||
        t_in.size() != lat_in.size() ||
        t_in.size() != lon_in.size())
        throw std::invalid_argument("interpolate_trajectory: vectori egali, minim 2 puncte");

    // grila noua de timp, pas constant dt
    double t0 = t_in.front();
    double t1 = t_in.back();
    std::vector<double> t_out;
    for (double t = t0; t <= t1 + 1e-9; t += dt) t_out.push_back(t);

    octave_value_list in;
    in(0) = vec2col(t_in);
    in(1) = vec2col(lat_in);
    in(2) = vec2col(lon_in);
    in(3) = vec2col(t_out);
    in(4) = method;

    octave_value_list out = session().feval("traj_interp", in, 2);

    InterpResult r;
    r.t = t_out;
    Matrix mlat = out(0).matrix_value();
    Matrix mlon = out(1).matrix_value();
    for (octave_idx_type i = 0; i < mlat.numel(); ++i) {
        r.lat.push_back(mlat(i));
        r.lon.push_back(mlon(i));
    }
    return r;
}

// ============================================================
//  2. PREDICTIE TREND (regresie liniara)
// ============================================================
struct TrendResult {
    double lat_pred;   // latitudine prezisa la t_future
    double lon_pred;   // longitudine prezisa la t_future
    double vlat;       // panta pe latitudine (grade/secunda)
    double vlon;       // panta pe longitudine (grade/secunda)
};

TrendResult predict_trend(
    const std::vector<double>& t_in,
    const std::vector<double>& lat_in,
    const std::vector<double>& lon_in,
    double t_future)
{
    if (t_in.size() < 2 ||
        t_in.size() != lat_in.size() ||
        t_in.size() != lon_in.size())
        throw std::invalid_argument("predict_trend: vectori egali, minim 2 puncte");

    octave_value_list in;
    in(0) = vec2col(t_in);
    in(1) = vec2col(lat_in);
    in(2) = vec2col(lon_in);
    in(3) = t_future;

    octave_value_list out = session().feval("traj_trend", in, 4);

    TrendResult r;
    r.lat_pred = out(0).double_value();
    r.lon_pred = out(1).double_value();
    r.vlat     = out(2).double_value();
    r.vlon     = out(3).double_value();
    return r;
}

// ============================================================
//  3. PRET / RISC
//     formula: distanta * importanta * viteza
// ============================================================
double compute_risk_price(double distance_m, double importance, double speed_mps) {
    octave_value_list in;
    in(0) = distance_m;
    in(1) = importance;
    in(2) = speed_mps;

    octave_value_list out = session().feval("risk_price", in, 1);
    return out(0).double_value();
}

// ============================================================
//  4. DISTANTA LA CEL MAI APROPIAT PUNCT CRITIC (pdist2)
// ============================================================
struct NearestResult {
    double distance_m;
    int    index;   // 0-indexat
};

NearestResult distance_to_nearest_critical(
    double drone_lat, double drone_lon,
    const std::vector<double>& crit_lat,
    const std::vector<double>& crit_lon)
{
    if (crit_lat.empty() || crit_lat.size() != crit_lon.size())
        throw std::invalid_argument("distance_to_nearest_critical: liste nevide, egale");

    octave_value_list in;
    in(0) = drone_lat;
    in(1) = drone_lon;
    in(2) = vec2col(crit_lat);
    in(3) = vec2col(crit_lon);

    octave_value_list out = session().feval("nearest_crit", in, 2);

    int idx     = static_cast<int>(out(0).int_value());
    double dmin = out(1).double_value();

    // Octave e 1-indexat, C++ 0-indexat
    return { dmin, idx - 1 };
}

/*

// ============================================================
//  DEMO / TEST
//  Poti sterge main-ul asta cand integrezi in proiectul tau.
// ============================================================
int main() {
    try {
        init_octave();
        std::cout << "Octave initializat.\n\n";

        // ---- date de test ----
        std::vector<double> t   = {0, 1, 2, 3, 4};
        std::vector<double> lat = {44.426, 44.427, 44.428, 44.429, 44.430};
        std::vector<double> lon = {26.102, 26.103, 26.104, 26.105, 26.106};

        // ---- 1) Interpolare ----
        auto ir = interpolate_trajectory(t, lat, lon, 0.5, "spline");
        std::cout << "--- Interpolare (" << ir.t.size() << " puncte) ---\n";
        for (size_t i = 0; i < ir.t.size(); ++i)
            std::cout << "  t=" << ir.t[i]
                      << "  lat=" << ir.lat[i]
                      << "  lon=" << ir.lon[i] << "\n";

        // ---- 2) Trend ----
        auto tr = predict_trend(t, lat, lon, 10.0);
        std::cout << "\n--- Trend la t=10 ---\n";
        std::cout << "  lat_pred=" << tr.lat_pred
                  << "  lon_pred=" << tr.lon_pred << "\n";
        std::cout << "  vlat=" << tr.vlat
                  << "  vlon=" << tr.vlon << "\n";

        // ---- 3) Distanta la cel mai apropiat punct critic ----
        std::vector<double> clat = {44.570, 44.575, 44.580};
        std::vector<double> clon = {26.080, 26.090, 26.100};
        auto nr = distance_to_nearest_critical(44.427, 26.103, clat, clon);
        std::cout << "\n--- Cea mai apropiata zona critica ---\n";
        std::cout << "  index=" << nr.index
                  << "  distanta=" << nr.distance_m << " m\n";

        // ---- 4) Pret / risc ----
        double price = compute_risk_price(nr.distance_m, 6.0, 15.3);
        std::cout << "\n--- Pret / risc ---\n";
        std::cout << "  price=" << price << "\n";

        shutdown_octave();
    } catch (const std::exception& e) {
        std::cerr << "Eroare: " << e.what() << "\n";
        return 1;
    }
    return 0;
}
*/
